import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };

maybeDescribe('question answering end to end (e2e, compiled server + fake Gemini over HTTP)', () => {
  jest.setTimeout(120_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  let meetingId: string;

  const waitFor = async <T>(read: () => Promise<T>, done: (v: T) => boolean): Promise<T> => {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const v = await read();
      if (done(v)) return v;
      if (Date.now() > deadline) throw new Error(`timeout: ${JSON.stringify(v)}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const create = async (title: string) => (await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, title })).body.id as string;

  beforeAll(async () => {
    // The fake embedding scores real matches around 0.5–0.6.
    e2e = await startE2eApp({ QA_MIN_SIMILARITY: '0.3' });
    owner = await e2e.createUser();
    meetingId = await create('Họp ngân sách');
    const lines = ['ngân sách quý bốn tăng mười phần trăm cho marketing', 'nhóm thiết kế xin nghỉ lễ tuần sau'];
    await e2e.http('POST', `/meetings/${meetingId}/segments/bulk`, owner.token, {
      segments: lines.map((text, i) => ({ seq: i + 1, text, started_at_ms: i * 5000, ended_at_ms: i * 5000 + 4000 })),
    });
    await e2e.http('POST', `/meetings/${meetingId}/end`, owner.token, { last_seq: lines.length });
    await waitFor(async () => (await e2e.http('GET', `/meetings/${meetingId}`, owner.token)).body, (m) => m.status === 'ready');
  });
  afterAll(async () => e2e?.close());

  it('answers a question about a meeting with a citation, and keeps the history', async () => {
    const res = await e2e.http('POST', `/meetings/${meetingId}/qa`, owner.token, { question: '  ngân sách quý bốn tăng bao nhiêu  ' });
    expect(res.status).toBe(200);
    expect(res.body.question).toMatchObject({ role: 'user', content: 'ngân sách quý bốn tăng bao nhiêu', filters: null });
    expect(res.body.answer).toMatchObject({ role: 'assistant', content: 'Câu trả lời thử', not_found: false, low_confidence: false });
    expect(res.body.answer.citations).toEqual([
      expect.objectContaining({ meeting_id: meetingId, meeting_title: 'Họp ngân sách', segment_seq: expect.any(Number), available: true }),
    ]);
    const history = await e2e.http('GET', `/meetings/${meetingId}/qa`, owner.token);
    expect(history.body).toMatchObject({ next_before: null });
    expect(history.body.items.map((m: { id: string }) => m.id)).toEqual([res.body.question.id, res.body.answer.id]);
    const { rows } = await e2e.db.query(`SELECT count(*)::int AS n FROM usage_records WHERE user_id = $1 AND operation = 'qa'`, [owner.id]);
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it('says "not found" for a question nothing answers, and keeps the global thread separate', async () => {
    const res = await e2e.http('POST', '/qa', owner.token, { question: 'thời tiết Hà Lan cuối tuần' });
    expect(res.body.answer).toMatchObject({ not_found: true, citations: [], confidence: 0 });
    const global = (await e2e.http('GET', '/qa', owner.token)).body.items;
    expect(global).toHaveLength(2);
    expect((await e2e.http('GET', `/meetings/${meetingId}/qa`, owner.token)).body.items).toHaveLength(2);
    expect((await e2e.http('DELETE', '/qa', owner.token)).status).toBe(204);
    expect((await e2e.http('GET', '/qa', owner.token)).body.items).toEqual([]);
    expect((await e2e.http('GET', `/meetings/${meetingId}/qa`, owner.token)).body.items).toHaveLength(2);
  });

  it('refuses a meeting with nothing processed yet, validates input, and keeps every route away from other users', async () => {
    const live = await create('Đang ghi');
    const notReady = await e2e.http('POST', `/meetings/${live}/qa`, owner.token, { question: 'có gì' });
    expect(notReady.status).toBe(409);
    expect(notReady.body.error.code).toBe('MEETING_NOT_READY');
    expect((await e2e.http('POST', `/meetings/${meetingId}/qa`, owner.token, { question: '   ' })).status).toBe(400);
    expect((await e2e.http('POST', '/qa', owner.token, { question: 'x', from: 'hôm qua' })).status).toBe(400);

    const stranger = await e2e.createUser();
    expect((await e2e.http('POST', `/meetings/${meetingId}/qa`, stranger.token, { question: 'ngân sách' })).status).toBe(404);
    expect((await e2e.http('GET', `/meetings/${meetingId}/qa`, stranger.token)).status).toBe(404);
    expect((await e2e.http('DELETE', `/meetings/${meetingId}/qa`, stranger.token)).status).toBe(404);
    const theirs = await e2e.http('POST', '/qa', stranger.token, { question: 'ngân sách quý bốn tăng bao nhiêu' });
    expect(theirs.body.answer).toMatchObject({ not_found: true, citations: [] }); // the owner's meeting is invisible
    const [{ id: ownerEntity }] = (await e2e.db.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, 'X', 'x', 'topic', '{}', array_fill(0.1, ARRAY[768])::vector) RETURNING id`,
      [owner.id],
    )).rows;
    expect((await e2e.http('POST', '/qa', stranger.token, { question: 'x', entity_id: ownerEntity })).status).toBe(404);
  });

  it('allows 30 questions an hour per user, then answers 429', async () => {
    const asker = await e2e.createUser();
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await e2e.http('POST', '/qa', asker.token, { question: `câu hỏi ${i}` })).status);
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(codes[30]).toBe(429);
    // Another user is not affected.
    expect((await e2e.http('POST', '/qa', owner.token, { question: 'ngân sách' })).status).toBe(200);
  });

  it('marks a stored citation unavailable once its passage is gone', async () => {
    const res = await e2e.http('POST', `/meetings/${meetingId}/qa`, owner.token, { question: 'ngân sách quý bốn' });
    expect(res.status).toBe(200);
    const [citedChunkId] = res.body.answer.citations.map((c: { chunk_id: string }) => c.chunk_id);
    // Delete the chunk
    await e2e.db.query('DELETE FROM meeting_chunks WHERE id = $1', [citedChunkId]);
    // Fetch history - the citation should now be unavailable
    const history = await e2e.http('GET', `/meetings/${meetingId}/qa`, owner.token);
    const answer = history.body.items.find((m: { role: string; citations: unknown[] }) => m.role === 'assistant' && m.citations.length > 0);
    expect(answer.citations[0]).toMatchObject({ available: false });
  });

  it('history paginates with a cursor: before parameter', async () => {
    // Use existing meeting and ask more questions to build pagination
    // Ask three more questions (we already have 2 from earlier tests)
    for (let i = 0; i < 3; i++) {
      await e2e.http('POST', `/meetings/${meetingId}/qa`, owner.token, { question: `câu hỏi phân trang ${i}` });
    }
    // Fetch first page (limit 2)
    const page1 = await e2e.http('GET', `/meetings/${meetingId}/qa?limit=2`, owner.token);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.next_before).toBeTruthy();
    // Fetch next page
    const page2 = await e2e.http('GET', `/meetings/${meetingId}/qa?limit=2&before=${page1.body.next_before}`, owner.token);
    expect(page2.body.items.length).toBeGreaterThan(0);
  });

  it('rejects questions with empty/whitespace content', async () => {
    const res = await e2e.http('POST', `/meetings/${meetingId}/qa`, owner.token, { question: '   ' });
    expect(res.status).toBe(400);
  });
});
