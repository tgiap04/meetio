import { jest } from '@jest/globals';
import { AppDataSource } from '../../database/data-source.js';
import { ExplainedStepError, NonRetryableStepError, type StepContext } from '../pipeline-step-handler.js';
import { STEP_ORDER } from '../pipeline-steps.js';
import { PipelineHarness } from './pipeline-harness.js';

const maybeDescribe = process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;

maybeDescribe('pipeline engine (integration, real Postgres + Redis + BullMQ)', () => {
  jest.setTimeout(30_000);
  let h: PipelineHarness;
  beforeAll(() => PipelineHarness.init());
  beforeEach(() => void (h = new PipelineHarness()));
  afterEach(() => h.close());
  afterAll(() => AppDataSource.destroy());

  const allHandlers = (run?: (ctx: StepContext) => Promise<void>) => STEP_ORDER.forEach((s) => h.handle(s, run));

  it('runs every step in order, then marks the meeting ready and announces it once', async () => {
    const order: string[] = [];
    STEP_ORDER.forEach((s) => h.handle(s, async () => void order.push(s)));
    const { meetingId } = await h.queuedMeeting();

    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    await h.waitFor(() => h.meeting(meetingId), (m) => m.status === 'ready');

    expect(order).toEqual([...STEP_ORDER]);
    expect(Object.values(await h.steps(meetingId)).every((s) => s.status === 'succeeded' && s.attempts === 1)).toBe(true);
    expect(h.ready).toEqual([meetingId]);
    expect(h.events.map((e) => e.step ?? e.status)).toEqual(expect.arrayContaining([...STEP_ORDER, 'ready']));
  });

  it('pauses at the first step without a handler — never a fake ready — and resumes once it exists', async () => {
    h.handle('chunk');
    h.handle('embed');
    const { meetingId } = await h.queuedMeeting();

    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    await h.waitFor(() => h.steps(meetingId), (s) => s.embed?.status === 'succeeded');
    await new Promise((r) => setTimeout(r, 200));
    expect((await h.meeting(meetingId)).status).toBe('processing');
    expect((await h.steps(meetingId)).extract).toMatchObject({ status: 'pending', attempts: 0 });
    expect(h.ready).toEqual([]);

    ['extract', 'resolve', 'summarize'].forEach((s) => h.handle(s as 'extract'));
    // The sweep scans the whole (shared) database, so aim it at this meeting alone: a cutoff in
    // the future would also hand meetings of suites running in parallel to this harness's handlers.
    await AppDataSource.query(`UPDATE meetings SET updated_at = '2000-01-01' WHERE id = $1`, [meetingId]);
    await h.engine.resumeStalled(new Date('2000-01-02'));
    await h.waitFor(() => h.meeting(meetingId), (m) => m.status === 'ready');
  });

  it('retries a failing step with backoff and succeeds without redoing earlier steps', async () => {
    let chunkRuns = 0;
    let embedCalls = 0;
    h.handle('chunk', async () => void chunkRuns++);
    h.handle('embed', async () => {
      if (++embedCalls < 3) throw new Error(`thử ${embedCalls}`);
    });
    ['extract', 'resolve', 'summarize'].forEach((s) => h.handle(s as 'extract'));
    const { meetingId } = await h.queuedMeeting();

    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    await h.waitFor(() => h.meeting(meetingId), (m) => m.status === 'ready');
    expect(chunkRuns).toBe(1);
    expect((await h.steps(meetingId)).embed).toEqual({ status: 'succeeded', attempts: 3, error_message: null });
  });

  it('fails the meeting at the right step after 1 + 3 attempts, keeping the error and the transcript', async () => {
    h.handle('chunk');
    h.handle('embed', async () => {
      throw new ExplainedStepError('mô hình trả lỗi');
    });
    ['extract', 'resolve', 'summarize'].forEach((s) => h.handle(s as 'extract'));
    const { meetingId } = await h.queuedMeeting();

    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    const meeting = await h.waitFor(() => h.meeting(meetingId), (m) => m.status === 'failed');
    expect(meeting.failure_reason).toBe('embed');
    const steps = await h.steps(meetingId);
    expect(steps.embed).toEqual({ status: 'failed', attempts: 4, error_message: 'mô hình trả lỗi' });
    expect(steps.extract.status).toBe('pending');
    expect(h.events).toContainEqual({ meeting_id: meetingId, status: 'failed', step: 'embed' });
    const [{ n }] = await AppDataSource.query('SELECT count(*)::int AS n FROM transcript_segments WHERE meeting_id = $1', [meetingId]);
    expect(n).toBe(1);
  });

  it('never stores a raw exception message where the status endpoint can show it', async () => {
    h.handle('chunk', async () => {
      throw new Error('duplicate key value violates unique constraint "uq_x" at 10.0.0.5');
    });
    const { meetingId } = await h.queuedMeeting();
    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    await h.waitFor(() => h.meeting(meetingId), (m) => m.status === 'failed');
    const { error_message } = (await h.steps(meetingId)).chunk;
    expect(error_message).toBe('Lỗi hệ thống ở bước chunk (Error)');
  });

  it('fails at once, without retrying, on a non-retryable error', async () => {
    let calls = 0;
    h.handle('chunk', async () => {
      calls++;
      throw new NonRetryableStepError('hết hạn mức');
    });
    const { meetingId } = await h.queuedMeeting();
    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    await h.waitFor(() => h.meeting(meetingId), (m) => m.status === 'failed');
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(1);
  });

  it('counts a step that overruns its time budget as a failed attempt', async () => {
    const slow = new PipelineHarness(50, 10);
    try {
      let calls = 0;
      slow.handle('chunk', (ctx) => {
        calls++;
        return calls === 1 ? new Promise((_, reject) => ctx.signal.addEventListener('abort', () => reject(new Error('aborted')))) : Promise.resolve();
      });
      ['embed', 'extract', 'resolve', 'summarize'].forEach((s) => slow.handle(s as 'embed'));
      const { meetingId } = await slow.queuedMeeting();
      await slow.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
      await slow.waitFor(() => slow.meeting(meetingId), (m) => m.status === 'ready');
      expect((await slow.steps(meetingId)).chunk.attempts).toBe(2);
    } finally {
      await slow.close();
    }
  });

  it('a step still running when its meeting is deleted finishes as a no-op and schedules nothing', async () => {
    let finish!: () => void;
    const started = new Promise<void>((resolve) => {
      h.handle('chunk', () => {
        resolve();
        return new Promise<void>((r) => (finish = r));
      });
    });
    let embedRan = false;
    h.handle('embed', async () => void (embedRan = true));
    const { meetingId } = await h.queuedMeeting();

    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    await started;
    await AppDataSource.query('DELETE FROM meetings WHERE id = $1', [meetingId]);
    finish();

    await new Promise((r) => setTimeout(r, 300));
    expect(embedRan).toBe(false);
    expect(await h.jobCount('embed')).toBe(0);
    const [{ n }] = await AppDataSource.query('SELECT count(*)::int AS n FROM processing_jobs WHERE meeting_id = $1', [meetingId]);
    expect(n).toBe(0);
  });

  it('ignores a job from an older run', async () => {
    allHandlers();
    const { meetingId } = await h.queuedMeeting();
    await AppDataSource.query('UPDATE meetings SET pipeline_run = 2 WHERE id = $1', [meetingId]);
    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    expect((await h.meeting(meetingId)).status).toBe('queued');
    expect(await h.steps(meetingId)).toEqual({});
  });

  it('advancing the same run twice schedules the step once', async () => {
    const { meetingId } = await h.queuedMeeting();
    h.handle('chunk', () => new Promise((r) => setTimeout(r, 300)));
    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    const state = (await h.store.current(meetingId, 1))!;
    await h.engine.advance(state);
    await h.engine.advance(state);
    expect(await h.jobCount('chunk')).toBeLessThanOrEqual(1);
    await h.waitFor(() => h.steps(meetingId), (s) => s.chunk?.status === 'succeeded');
    expect((await h.steps(meetingId)).chunk.attempts).toBe(1);
  });

  it('passes scope and the edit window to handlers', async () => {
    const seen: StepContext[] = [];
    allHandlers(async (ctx) => void seen.push(ctx));
    const { meetingId, userId } = await h.queuedMeeting();
    const since = new Date('2026-09-01T00:00:00Z');
    await AppDataSource.query(`UPDATE meetings SET pipeline_scope = 'changed', pipeline_changed_since = $2 WHERE id = $1`, [meetingId, since]);
    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    await h.waitFor(() => h.meeting(meetingId), (m) => m.status === 'ready');
    expect(seen[0]).toMatchObject({ meetingId, userId, run: 1, scope: 'changed', changedSince: since });
  });
});
