import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'high' };
const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/**
 * Phase 08: a meeting started offline is created later, with the id the client generated and the
 * time recording really began; pause/resume/end replayed later carry when the user pressed them.
 */
maybeDescribe('meeting create/transition replay after an offline start (e2e)', () => {
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  let stranger: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
    stranger = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());
  jest.setTimeout(60_000);

  const startedAtOf = async (id: string) =>
    ((await e2e.db.query('SELECT started_at FROM meetings WHERE id = $1', [id])).rows[0].started_at as Date).getTime();

  it('creating the same client id twice returns the one meeting, dated from started_at', async () => {
    const id = randomUUID();
    const startedAt = ago(120 * MIN);
    const first = await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, id, started_at: startedAt });
    const again = await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, id, started_at: ago(1000) });

    expect(first.status).toBe(201);
    expect(first.body).toEqual({ id, status: 'recording', started_at: startedAt });
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    const rows = await e2e.db.query('SELECT count(*)::int AS n FROM meetings WHERE id = $1', [id]);
    expect(rows.rows[0].n).toBe(1);
  });

  it('a replayed create returns the current status, not a fresh recording', async () => {
    const id = randomUUID();
    await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, id });
    await e2e.http('POST', `/meetings/${id}/pause`, owner.token, {});
    const again = await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, id });
    expect(again.body.status).toBe('paused');
  });

  it("someone else's id reads as MEETING_NOT_FOUND and leaves their meeting untouched", async () => {
    const id = randomUUID();
    await e2e.http('POST', '/meetings', stranger.token, { ...NEW_MEETING, id, title: 'Của người khác' });
    const res = await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, id, title: 'Chiếm' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MEETING_NOT_FOUND');
    const row = (await e2e.db.query('SELECT user_id, title FROM meetings WHERE id = $1', [id])).rows[0];
    expect(row).toEqual({ user_id: stranger.id, title: 'Của người khác' });
  });

  it('clamps started_at to [now − 24h, now]', async () => {
    const before = Date.now();
    const future = (await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, started_at: new Date(before + 60 * MIN).toISOString() })).body.id;
    const ancient = (await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, started_at: ago(72 * 60 * MIN) })).body.id;
    const after = Date.now();

    expect(await startedAtOf(future)).toBeGreaterThanOrEqual(before);
    expect(await startedAtOf(future)).toBeLessThanOrEqual(after);
    expect(await startedAtOf(ancient)).toBeGreaterThanOrEqual(before - 24 * 60 * MIN);
    expect(await startedAtOf(ancient)).toBeLessThanOrEqual(after - 24 * 60 * MIN);
  });

  it('pause/resume/end replayed late keep the real paused time out of the duration', async () => {
    const id = randomUUID();
    await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, id, started_at: ago(120 * MIN) });
    // Recorded 10 min, paused 30 min, recorded 20 min more — all replayed just now.
    await e2e.http('POST', `/meetings/${id}/pause`, owner.token, { at: ago(110 * MIN) });
    await e2e.http('POST', `/meetings/${id}/resume`, owner.token, { at: ago(80 * MIN) });
    const endedAt = ago(60 * MIN);
    const end = await e2e.http('POST', `/meetings/${id}/end`, owner.token, { at: endedAt });

    expect(end.status).toBe(200);
    expect(end.body.duration_sec).toBe(30 * 60);
    const row = (await e2e.db.query('SELECT ended_at FROM meetings WHERE id = $1', [id])).rows[0];
    expect((row.ended_at as Date).toISOString()).toBe(endedAt);
  });

  it('never lets a replayed resume or end run backwards past the pause it closes', async () => {
    const id = randomUUID();
    await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, id, started_at: ago(60 * MIN) });
    await e2e.http('POST', `/meetings/${id}/pause`, owner.token, { at: ago(30 * MIN) });
    await e2e.http('POST', `/meetings/${id}/resume`, owner.token, { at: ago(50 * MIN) }); // before the pause → clamped
    const end = await e2e.http('POST', `/meetings/${id}/end`, owner.token, { at: new Date(Date.now() + 60 * MIN).toISOString() });

    // Paused 0 (resume clamped to the pause), ended now (future clamped) → ~60 min recorded.
    expect(end.body.duration_sec).toBeGreaterThanOrEqual(60 * 60 - 1);
    expect(end.body.duration_sec).toBeLessThanOrEqual(60 * 60 + 5);
  });

  it.each([
    ['a non-uuid id', { ...NEW_MEETING, id: 'abc' }],
    ['a non-ISO started_at', { ...NEW_MEETING, started_at: 'yesterday' }],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_, body) => {
    const res = await e2e.http('POST', '/meetings', owner.token, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-ISO transition time with 400 VALIDATION_ERROR', async () => {
    const id = (await e2e.http('POST', '/meetings', owner.token, NEW_MEETING)).body.id;
    const res = await e2e.http('POST', `/meetings/${id}/pause`, owner.token, { at: 12 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
