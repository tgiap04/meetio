import { jest } from '@jest/globals';
import { AppDataSource } from '../../database/data-source.js';
import { STEP_ORDER } from '../../pipeline/pipeline-steps.js';
import { PipelineHarness } from '../../pipeline/__tests__/pipeline-harness.js';
import { ChunkStepHandler } from '../chunk-step.handler.js';
import { EmbedStepHandler } from '../embed-step.handler.js';
import { fakeGemini } from './fake-gemini.js';

const maybeDescribe = process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;
const SMALL = { targetTokens: 60, overlapRatio: 0.15, minBoundaryRatio: 0.7, longPauseMs: 2000 };

maybeDescribe('chunk + embed steps (integration, real Postgres + BullMQ)', () => {
  jest.setTimeout(30_000);
  let h: PipelineHarness;
  beforeAll(() => PipelineHarness.init());
  beforeEach(() => void (h = new PipelineHarness()));
  afterEach(() => h.close());
  afterAll(() => AppDataSource.destroy());

  async function meetingWithTranscript(count: number) {
    const { meetingId, userId } = await h.queuedMeeting();
    await AppDataSource.query('DELETE FROM transcript_segments WHERE meeting_id = $1', [meetingId]);
    await AppDataSource.query(
      `INSERT INTO transcript_segments (meeting_id, seq, text, started_at_ms, ended_at_ms)
       SELECT $1, g, 'câu số ' || g || ' nói về ngân sách dự án và kế hoạch tuần sau', g * 1000, g * 1000 + 900
       FROM generate_series(1, $2) AS g`,
      [meetingId, count],
    );
    return { meetingId, userId };
  }
  const chunks = (meetingId: string) =>
    AppDataSource.query(
      'SELECT id, segment_start_seq, segment_end_seq, token_count, embedding IS NOT NULL AS embedded, content_hash FROM meeting_chunks WHERE meeting_id = $1 ORDER BY segment_start_seq',
      [meetingId],
    );

  it('runs chunk → embed in the pipeline and pauses at extract: every chunk embedded with a real token count', async () => {
    const gemini = fakeGemini(AppDataSource);
    h.handle('chunk', (ctx) => new ChunkStepHandler(AppDataSource, SMALL).run(ctx));
    h.handle('embed', (ctx) => new EmbedStepHandler(AppDataSource, gemini.client).run(ctx));
    const { meetingId, userId } = await meetingWithTranscript(40);

    await h.engine.handleRunJob({ meeting_id: meetingId, run: 1 });
    await h.waitFor(() => h.steps(meetingId), (s) => s.embed?.status === 'succeeded');

    const rows = await chunks(meetingId);
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((r: { embedded: boolean; token_count: number }) => r.embedded && r.token_count > 0)).toBe(true);
    expect(rows[0].segment_start_seq).toBe(1);
    expect(rows[rows.length - 1].segment_end_seq).toBe(40);
    expect((await h.meeting(meetingId)).status).toBe('processing'); // waits at extract (Phase 13)
    expect((await h.steps(meetingId)).extract.status).toBe('pending');

    const [usage] = await AppDataSource.query(
      `SELECT count(*)::int AS calls, sum(input_tokens)::int AS tokens FROM usage_records WHERE user_id = $1 AND operation = 'embed'`,
      [userId],
    );
    const tokenSum = rows.reduce((a: number, r: { token_count: number }) => a + r.token_count, 0);
    expect(usage.tokens).toBe(tokenSum);
    expect(usage.calls).toBe(Math.ceil(rows.length / 20));
  });

  it('after a transcript edit, keeps unchanged chunks (same id and embedding) and redoes only the affected ones', async () => {
    const gemini = fakeGemini(AppDataSource);
    const { meetingId, userId } = await meetingWithTranscript(60);
    const ctx = { meetingId, userId, run: 1, scope: 'full' as const, changedSince: null, signal: new AbortController().signal };
    const chunkStep = new ChunkStepHandler(AppDataSource, SMALL);
    const embedStep = new EmbedStepHandler(AppDataSource, gemini.client);
    await chunkStep.run(ctx);
    await embedStep.run(ctx);
    const before = await chunks(meetingId);
    const embedCallsBefore = gemini.calls.embed;

    await AppDataSource.query(`UPDATE transcript_segments SET text = 'đã sửa: thuật ngữ Meetio', edited_at = now() WHERE meeting_id = $1 AND seq = 45`, [meetingId]);
    await chunkStep.run({ ...ctx, run: 2, scope: 'changed' });
    const mid = await chunks(meetingId);
    const unembedded = mid.filter((r: { embedded: boolean }) => !r.embedded);
    expect(unembedded.length).toBeGreaterThan(0);
    expect(unembedded.every((r: { segment_start_seq: number; segment_end_seq: number }) => r.segment_start_seq <= 45 && r.segment_end_seq >= 45)).toBe(true);
    const keptIds = new Set(before.map((r: { id: string }) => r.id));
    const untouched = mid.filter((r: { segment_end_seq: number; segment_start_seq: number }) => r.segment_end_seq < 45 || r.segment_start_seq > 45);
    expect(untouched.every((r: { id: string; embedded: boolean }) => keptIds.has(r.id) && r.embedded)).toBe(true);

    await embedStep.run({ ...ctx, run: 2, scope: 'changed' });
    expect(gemini.calls.embed - embedCallsBefore).toBe(1); // only the affected chunks, one batch
    expect((await chunks(meetingId)).every((r: { embedded: boolean }) => r.embedded)).toBe(true);
  });

  it('is idempotent: re-running chunk and embed changes nothing and calls Gemini no more', async () => {
    const gemini = fakeGemini(AppDataSource);
    const { meetingId, userId } = await meetingWithTranscript(30);
    const ctx = { meetingId, userId, run: 1, scope: 'full' as const, changedSince: null, signal: new AbortController().signal };
    const chunkStep = new ChunkStepHandler(AppDataSource, SMALL);
    const embedStep = new EmbedStepHandler(AppDataSource, gemini.client);
    await chunkStep.run(ctx);
    await embedStep.run(ctx);
    const first = await chunks(meetingId);
    const calls = gemini.calls.embed;
    await chunkStep.run(ctx);
    await embedStep.run(ctx);
    expect(await chunks(meetingId)).toEqual(first);
    expect(gemini.calls.embed).toBe(calls);
  });

  it('a meeting with no transcript produces no chunks and no Gemini calls', async () => {
    const gemini = fakeGemini(AppDataSource);
    const { meetingId, userId } = await meetingWithTranscript(0);
    const ctx = { meetingId, userId, run: 1, scope: 'full' as const, changedSince: null, signal: new AbortController().signal };
    await new ChunkStepHandler(AppDataSource, SMALL).run(ctx);
    await new EmbedStepHandler(AppDataSource, gemini.client).run(ctx);
    expect(await chunks(meetingId)).toEqual([]);
    expect(gemini.calls.embed + gemini.calls.count).toBe(0);
  });

  it('keeps the pipeline order: chunk and embed are the first two steps', () => {
    expect(STEP_ORDER.slice(0, 2)).toEqual(['chunk', 'embed']);
  });
});
