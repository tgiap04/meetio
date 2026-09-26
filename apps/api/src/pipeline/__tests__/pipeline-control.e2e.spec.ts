import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { PushCaptureServer } from '../../test-support/push-capture-server.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_GONE = 'ExponentPushToken[GoneGoneGoneGoneGone]';

maybeDescribe('pipeline control, status and push (e2e)', () => {
  jest.setTimeout(90_000);
  let e2e: E2eApp;
  let push: PushCaptureServer;
  let owner: { id: string; token: string };

  beforeAll(async () => {
    push = new PushCaptureServer();
    await push.start();
    e2e = await startE2eApp({ EXPO_PUSH_URL: push.url });
    owner = await e2e.createUser();
  });
  afterAll(async () => {
    await e2e?.close();
    await push?.stop();
  });

  const create = async (token = owner.token) => (await e2e.http('POST', '/meetings', token, NEW_MEETING)).body.id as string;
  const meeting = async (id: string) =>
    (await e2e.db.query('SELECT status, pipeline_run, pipeline_scope, pipeline_started_at, pipeline_changed_since FROM meetings WHERE id = $1', [id])).rows[0];
  const waitFor = async <T>(read: () => Promise<T>, done: (v: T) => boolean): Promise<T> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const v = await read();
      if (done(v)) return v;
      if (Date.now() > deadline) throw new Error(`timeout: ${JSON.stringify(v)}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  /** Stand-in for Phases 12–14: mark every step done, then let the resume sweep complete the run. */
  const finishRun = async (id: string) => {
    await e2e.db.query(`UPDATE processing_jobs SET status = 'succeeded', finished_at = now() WHERE meeting_id = $1`, [id]);
    await e2e.db.query(`UPDATE meetings SET updated_at = now() - interval '11 minutes' WHERE id = $1`, [id]);
    await e2e.runMaintenance('resume-stalled-pipelines');
    return waitFor(() => meeting(id), (m) => m.status === 'ready');
  };

  it('end starts run 1: chunk, embed, extract and resolve run, then it waits at the first unimplemented step (summarize)', async () => {
    const id = await create();
    expect((await e2e.http('POST', `/meetings/${id}/end`, owner.token, {})).body.status).toBe('queued');
    const status = await waitFor(
      async () => (await e2e.http('GET', `/meetings/${id}/status`, owner.token)).body,
      (s) => s.current_step === 'summarize',
    );
    expect(status).toMatchObject({ meeting_id: id, status: 'processing', current_step: 'summarize', failure_reason: null });
    expect(status.steps.map((s: { step: string; status: string }) => `${s.step}:${s.status}`)).toEqual([
      'chunk:succeeded', 'embed:succeeded', 'extract:succeeded', 'resolve:succeeded', 'summarize:pending',
    ]);
    expect((await meeting(id)).pipeline_run).toBe(1);
  });

  it('completes, announces over push exactly once with generic text, and drops dead device tokens', async () => {
    await e2e.http('POST', '/users/me/push-tokens', owner.token, { token: TOKEN_A, platform: 'ios' });
    await e2e.http('POST', '/users/me/push-tokens', owner.token, { token: TOKEN_GONE, platform: 'android' });
    const id = await create();
    await e2e.http('PATCH', `/meetings/${id}`, owner.token, { title: 'Bí mật: sáp nhập công ty X' });
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, { segments: [{ seq: 1, text: 'a', started_at_ms: 0, ended_at_ms: 1 }] });
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 1 });
    await waitFor(() => meeting(id), (m) => m.status === 'processing');
    push.received.length = 0;

    await finishRun(id);
    await waitFor(async () => push.received.length, (n) => n >= 2).catch((e) => {
      throw new Error(`${e.message}\n--- server log ---\n${e2e.logs().slice(-3000)}`);
    });
    expect(push.received.map((m) => m.to).sort()).toEqual([TOKEN_A, TOKEN_GONE].sort());
    for (const m of push.received) {
      expect(m.data).toEqual({ type: 'meeting_ready', meeting_id: id });
      expect(`${m.title} ${m.body}`).not.toContain('sáp nhập');
    }
    const tokens = (await e2e.db.query('SELECT token FROM push_tokens WHERE user_id = $1', [owner.id])).rows.map((r: { token: string }) => r.token);
    expect(tokens).toEqual([TOKEN_A]);

    // A later edit + re-run finishing again does not notify again (US-30: one per meeting).
    const segmentId = (await e2e.db.query('SELECT id FROM transcript_segments WHERE meeting_id = $1', [id])).rows[0].id;
    await e2e.http('PATCH', `/segments/${segmentId}`, owner.token, { text: 'đã sửa' });
    expect((await e2e.http('POST', `/meetings/${id}/reindex`, owner.token, { scope: 'changed' })).status).toBe(200);
    await waitFor(() => meeting(id), (m) => m.status === 'processing' && m.pipeline_run === 2);
    const before = push.received.length;
    await finishRun(id);
    await new Promise((r) => setTimeout(r, 500));
    expect(push.received.length).toBe(before);
  });

  it('respects the meeting_ready_push setting', async () => {
    const quiet = await e2e.createUser();
    await e2e.http('POST', '/users/me/push-tokens', quiet.token, { token: 'ExponentPushToken[qqqqqqqqqqqqqqqqqqqqqq]', platform: 'ios' });
    await e2e.http('PATCH', '/users/me', quiet.token, { notification_settings: { meeting_ready_push: false } });
    const id = await create(quiet.token);
    await e2e.http('POST', `/meetings/${id}/end`, quiet.token, {});
    await waitFor(() => meeting(id), (m) => m.status === 'processing');
    const before = push.received.length;
    await finishRun(id);
    await new Promise((r) => setTimeout(r, 500));
    expect(push.received.length).toBe(before);
  });

  it('reindex: 409 while live, 400 when nothing was edited, and a changed run scoped to the edit window', async () => {
    const id = await create();
    expect((await e2e.http('POST', `/meetings/${id}/reindex`, owner.token, { scope: 'full' })).status).toBe(409);
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, { segments: [{ seq: 1, text: 'a', started_at_ms: 0, ended_at_ms: 1 }] });
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 1 });
    await waitFor(() => meeting(id), (m) => m.status === 'processing');
    const firstRun = await finishRun(id);

    const unchanged = await e2e.http('POST', `/meetings/${id}/reindex`, owner.token, { scope: 'changed' });
    expect(unchanged.status).toBe(400);

    const segmentId = (await e2e.db.query('SELECT id FROM transcript_segments WHERE meeting_id = $1', [id])).rows[0].id;
    await e2e.http('PATCH', `/segments/${segmentId}`, owner.token, { text: 'đã sửa' });
    const res = await e2e.http('POST', `/meetings/${id}/reindex`, owner.token, { scope: 'changed' });
    expect(res.body.status).toBe('queued');
    const queued = await waitFor(() => meeting(id), (m) => m.pipeline_run === 2);
    expect(queued.pipeline_scope).toBe('changed');
    expect(new Date(queued.pipeline_changed_since).getTime()).toBe(new Date(firstRun.pipeline_started_at).getTime());
    const steps = (await e2e.http('GET', `/meetings/${id}/status`, owner.token)).body.steps;
    expect(steps.every((s: { status: string }) => s.status !== 'succeeded')).toBe(true);
  });

  it('retry after a failure resumes from the failed step and skips the succeeded ones (US-29)', async () => {
    const id = await create();
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, {});
    await waitFor(() => meeting(id), (m) => m.status === 'processing');
    await e2e.db.query(`UPDATE processing_jobs SET status = 'succeeded' WHERE meeting_id = $1 AND step IN ('chunk', 'embed', 'extract', 'resolve')`, [id]);
    await e2e.db.query(`UPDATE processing_jobs SET status = 'failed', attempts = 4, error_message = 'x' WHERE meeting_id = $1 AND step = 'summarize'`, [id]);
    await e2e.db.query(`UPDATE meetings SET status = 'failed', failure_reason = 'summarize' WHERE id = $1`, [id]);

    const failed = await e2e.http('GET', `/meetings/${id}/status`, owner.token);
    expect(failed.body).toMatchObject({ status: 'failed', current_step: 'summarize', failure_reason: 'summarize' });

    expect((await e2e.http('POST', `/meetings/${id}/reindex`, owner.token, { scope: 'changed' })).status).toBe(200);
    await waitFor(() => meeting(id), (m) => m.status === 'processing' && m.pipeline_run === 2);
    const steps = Object.fromEntries(
      (await e2e.http('GET', `/meetings/${id}/status`, owner.token)).body.steps.map((s: { step: string; status: string; attempts: number }) => [s.step, s]),
    );
    expect(['chunk', 'embed', 'extract', 'resolve'].map((k) => steps[k].status)).toEqual(['succeeded', 'succeeded', 'succeeded', 'succeeded']);
    // summarize has no handler yet (Phase 14): it is queued again from zero attempts, not skipped.
    expect(steps.summarize).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it('moves a device token to whoever registered it last, and only its owner can remove it', async () => {
    const other = await e2e.createUser();
    const token = 'ExponentPushToken[movemovemovemovemove]';
    await e2e.http('POST', '/users/me/push-tokens', owner.token, { token, platform: 'ios' });
    await e2e.http('POST', '/users/me/push-tokens', other.token, { token, platform: 'ios' });
    const holder = async () => (await e2e.db.query('SELECT user_id FROM push_tokens WHERE token = $1', [token])).rows[0]?.user_id;
    expect(await holder()).toBe(other.id);
    expect((await e2e.http('DELETE', '/users/me/push-tokens', owner.token, { token })).status).toBe(204);
    expect(await holder()).toBe(other.id);
    await e2e.http('DELETE', '/users/me/push-tokens', other.token, { token });
    expect(await holder()).toBeUndefined();
    expect((await e2e.http('POST', '/users/me/push-tokens', owner.token, { token: 'not-a-token', platform: 'ios' })).status).toBe(400);
  });
});
