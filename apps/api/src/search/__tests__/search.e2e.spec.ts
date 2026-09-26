import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };

maybeDescribe('semantic search end to end (e2e, compiled server + fake Gemini over HTTP)', () => {
  jest.setTimeout(90_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  let meetingId: string;

  const waitFor = async <T>(read: () => Promise<T>, done: (v: T) => boolean): Promise<T> => {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const v = await read();
      if (done(v)) return v;
      if (Date.now() > deadline) throw new Error(`timeout: ${JSON.stringify(v)}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
    meetingId = (await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, title: 'Họp tài chính quý 4' })).body.id;
    const lines = [
      'chào mọi người hôm nay mình bàn kế hoạch',
      'ngân sách quý sau dự kiến tăng mười phần trăm cho marketing',
      'nhóm thiết kế xin nghỉ lễ tuần sau',
      'bên kỹ thuật cần thêm hai máy chủ',
    ];
    await e2e.http('POST', `/meetings/${meetingId}/segments/bulk`, owner.token, {
      segments: lines.map((text, i) => ({ seq: i + 1, text, started_at_ms: i * 5000, ended_at_ms: i * 5000 + 4000 })),
    });
    await e2e.http('POST', `/meetings/${meetingId}/end`, owner.token, { last_seq: lines.length });
    // chunk and embed run for real; the pipeline then waits at extract (Phase 13).
    await waitFor(
      async () => (await e2e.http('GET', `/meetings/${meetingId}/status`, owner.token)).body,
      (s) => s.current_step === 'extract' && s.status === 'processing',
    );
  });
  afterAll(async () => e2e?.close());

  it('the pipeline chunked and embedded the transcript with real token accounting', async () => {
    const { rows } = await e2e.db.query('SELECT token_count, embedding IS NOT NULL AS embedded FROM meeting_chunks WHERE meeting_id = $1', [meetingId]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: { embedded: boolean; token_count: number }) => r.embedded && r.token_count > 0)).toBe(true);
    const { rows: usage } = await e2e.db.query(`SELECT count(*)::int AS n FROM usage_records WHERE user_id = $1 AND operation = 'embed' AND input_tokens > 0`, [owner.id]);
    expect(usage[0].n).toBeGreaterThan(0);
  });

  it('finds the passage and points at the transcript seq to open', async () => {
    const res = await e2e.http('GET', `/search?q=${encodeURIComponent('ngân sách quý sau')}`, owner.token);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ meeting_id: meetingId, meeting_title: 'Họp tài chính quý 4', segment_seq: expect.any(Number) });
    expect(res.body.items[0].excerpt).toContain('ngân sách');
    expect(res.body.items[0].score).toBeGreaterThan(0);
    const { rows } = await e2e.db.query(`SELECT count(*)::int AS n FROM usage_records WHERE user_id = $1 AND operation = 'search'`, [owner.id]);
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("returns nothing from someone else's meetings", async () => {
    const stranger = await e2e.createUser();
    const res = await e2e.http('GET', `/search?q=${encodeURIComponent('ngân sách quý sau')}`, stranger.token);
    expect(res.body).toEqual({ items: [], next_offset: null });
  });

  it('spreads calls across keys and moves off a rate-limited key without failing the search', async () => {
    e2e.gemini.calls.length = 0;
    for (let i = 0; i < 4; i++) await e2e.http('GET', '/search?q=marketing', owner.token);
    const keys = new Set(e2e.gemini.calls.map((c) => c.key));
    expect([...keys].sort()).toEqual(['e2e-key-a', 'e2e-key-b']);

    e2e.gemini.rateLimited.add('e2e-key-a');
    e2e.gemini.calls.length = 0;
    const res = await e2e.http('GET', '/search?q=marketing', owner.token);
    expect(res.status).toBe(200);
    expect(e2e.gemini.calls.some((c) => c.key === 'e2e-key-b')).toBe(true);
    expect(e2e.logs()).not.toContain('e2e-key-a');
  });

  it('answers 503 AI_SERVICE_UNAVAILABLE when every key is resting', async () => {
    e2e.gemini.rateLimited.add('e2e-key-a');
    e2e.gemini.rateLimited.add('e2e-key-b');
    const res = await e2e.http('GET', '/search?q=marketing', owner.token);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_SERVICE_UNAVAILABLE');
    e2e.gemini.rateLimited.clear();
  });

  it('validates the query', async () => {
    expect((await e2e.http('GET', '/search?q=a', owner.token)).status).toBe(400);
    expect((await e2e.http('GET', '/search?q=abc&limit=100', owner.token)).status).toBe(400);
  });

  it('limits /search to 60 requests per minute per user', async () => {
    const busy = await e2e.createUser();
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await e2e.http('GET', '/search?q=abc', busy.token)).status);
    // Only the throttle is under test: keys may still be resting from the previous test (503),
    // but none of the first 60 may be refused as over the limit.
    expect(statuses.slice(0, 60).filter((s) => s === 429)).toEqual([]);
    expect(statuses[60]).toBe(429);
  });
});
