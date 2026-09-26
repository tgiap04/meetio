import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { scriptedModel } from '../../test-support/scripted-extraction-model.js';
import { scriptedSummaryModel } from '../../test-support/scripted-summary-model.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };
const pad = (s: string) => `${s} ` + 'mọi người trao đổi thêm về kế hoạch chi tiết trong tuần '.repeat(4);

maybeDescribe('summaries and action items end to end (e2e, compiled server + fake Gemini over HTTP)', () => {
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
  const get = (path: string, token = owner.token) => e2e.http('GET', path, token);
  const record = async (title: string, lines: string[]) => {
    const id = (await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, title })).body.id as string;
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: lines.map((text, i) => ({ seq: i + 1, text, started_at_ms: i * 5000, ended_at_ms: i * 5000 + 4000 })),
    });
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: lines.length });
    await waitFor(async () => (await get(`/meetings/${id}/status`)).body, (s) => s.status === 'ready' || s.status === 'failed');
    return id;
  };

  beforeAll(async () => {
    e2e = await startE2eApp();
    e2e.gemini.generate = scriptedModel([{ when: 'Bình', entities: [{ name: 'anh Bình', type: 'person' }] }]);
    e2e.gemini.summarize = scriptedSummaryModel([
      { when: 'ngân sách', point: 'Ngân sách quý bốn tăng 10%' },
      { when: 'ra mắt', decision: 'Ra mắt vào tháng 11' },
      { when: 'Bình gửi', action: { content: 'Gửi báo cáo ngân sách', assignee: 'Bình', due_date: '2026-10-02' } },
      { when: 'ai đó', action: { content: 'Đặt phòng demo', assignee: 'ai đó' } },
    ]);
    owner = await e2e.createUser();
    meetingId = await record('Họp ngân sách', [pad('ngân sách quý bốn tăng'), pad('chốt ra mắt tháng 11'), pad('anh Bình gửi báo cáo thứ Sáu, ai đó đặt phòng')]);
  });
  afterAll(async () => e2e?.close());

  it('runs the whole pipeline to ready with a cited summary that opens the transcript at the source', async () => {
    const res = await get(`/meetings/${meetingId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ meeting_id: meetingId, insufficient: false, has_unprocessed_edits: false });
    expect(res.body.points).toEqual([expect.objectContaining({ kind: 'point', text: 'Ngân sách quý bốn tăng 10%', segment_seq: expect.any(Number) })]);
    expect(res.body.decisions).toEqual([expect.objectContaining({ kind: 'decision', text: 'Ra mắt vào tháng 11' })]);
    expect(res.body.summary).toContain('• Ngân sách quý bốn tăng 10%');
    expect((await get(`/meetings/${meetingId}`)).body).toMatchObject({ status: 'ready', summary_insufficient: false });
  });

  it('extracts tasks with a named, known assignee and a deadline — and leaves an unclear assignee empty', async () => {
    const { items } = (await get(`/meetings/${meetingId}/actions`)).body;
    const byContent = Object.fromEntries(items.map((i: { content: string }) => [i.content, i]));
    expect(byContent['Gửi báo cáo ngân sách']).toMatchObject({ assignee_name: 'anh Bình', due_date: '2026-10-02', status: 'open', is_manual: false, segment_seq: expect.any(Number) });
    expect(byContent['Đặt phòng demo']).toMatchObject({ assignee_entity_id: null, assignee_name: null });
  });

  it('says plainly when a meeting is too short to summarize', async () => {
    const id = await record('Thử micro', ['alo alo']);
    expect((await get(`/meetings/${id}/summary`)).body).toMatchObject({
      insufficient: true,
      points: [],
      summary: 'Cuộc họp quá ngắn hoặc không có đủ nội dung để tóm tắt.',
    });
  });

  it('ticks, edits, adds and deletes tasks; done items sink to the end; a re-run keeps what the user touched', async () => {
    const { items } = (await get(`/meetings/${meetingId}/actions`)).body;
    const report = items.find((i: { content: string }) => i.content === 'Gửi báo cáo ngân sách');
    const ticked = await e2e.http('PATCH', `/actions/${report.id}`, owner.token, { status: 'done' });
    expect(ticked.body).toMatchObject({ id: report.id, status: 'done' });

    const manual = await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, { content: 'In tài liệu', due_date: '2026-09-30' });
    expect(manual.status).toBe(201);
    expect(manual.body).toMatchObject({ content: 'In tài liệu', is_manual: true, assignee_name: null, due_date: '2026-09-30' });

    const list = (await get(`/actions?meeting_id=${meetingId}`)).body.items.map((i: { content: string }) => i.content);
    expect(list[list.length - 1]).toBe('Gửi báo cáo ngân sách'); // done → last
    expect((await get(`/actions?status=open&meeting_id=${meetingId}`)).body.items.map((i: { content: string }) => i.content)).not.toContain('Gửi báo cáo ngân sách');

    const cleared = await e2e.http('PATCH', `/actions/${report.id}`, owner.token, { assignee_entity_id: null, due_date: null });
    expect(cleared.body).toMatchObject({ assignee_entity_id: null, assignee_name: null, due_date: null, status: 'done' });

    expect((await e2e.http('POST', `/meetings/${meetingId}/reindex`, owner.token, { scope: 'full' })).status).toBe(200);
    await waitFor(async () => (await e2e.db.query('SELECT pipeline_run, status FROM meetings WHERE id = $1', [meetingId])).rows[0], (r) => r.pipeline_run === 2 && r.status === 'ready');
    const after = (await get(`/meetings/${meetingId}/actions`)).body.items as { content: string; status: string }[];
    expect(after.filter((i) => i.content === 'Gửi báo cáo ngân sách')).toEqual([expect.objectContaining({ status: 'done' })]); // kept, not duplicated
    expect(after.map((i) => i.content)).toEqual(expect.arrayContaining(['In tài liệu', 'Đặt phòng demo']));

    expect((await e2e.http('DELETE', `/actions/${manual.body.id}`, owner.token)).status).toBe(204);
    expect((await e2e.http('DELETE', `/actions/${manual.body.id}`, owner.token)).status).toBe(404);
  });

  it('filters the cross-meeting list by assignee and reports filter options with the exact open count', async () => {
    const binh = (await get('/entities?type=person&q=binh')).body.items[0];
    const other = await record('Họp khác', [pad('anh Bình gửi báo cáo tuần'), pad('rà soát tiến độ')]); // ≥ 80 words, or there is nothing to summarize
    const filters = (await get('/actions/filters')).body;
    expect(filters.assignees).toEqual([expect.objectContaining({ id: binh.id, canonical_name: 'anh Bình', open_count: 1 })]);
    // The exact count includes unassigned items; meetings list those with open items, newest first.
    const [{ n }] = (await e2e.db.query(`SELECT count(*)::int AS n FROM action_items WHERE user_id = $1 AND status = 'open'`, [owner.id])).rows;
    expect(filters.open_total).toBe(n);
    expect(filters.open_total).toBeGreaterThan(1);
    expect(filters.meetings.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([other, meetingId]));
    const mine = (await get(`/actions?assignee_entity_id=${binh.id}`)).body.items;
    expect(mine.map((i: { meeting_id: string }) => i.meeting_id)).toEqual([other]);
    expect(mine[0]).toMatchObject({ meeting_title: 'Họp khác', meeting_date: expect.any(String) });
  });

  it('validates input and keeps every route away from other users', async () => {
    const { items } = (await get(`/meetings/${meetingId}/actions`)).body;
    expect((await e2e.http('PATCH', `/actions/${items[0].id}`, owner.token, { due_date: 'thứ Sáu' })).status).toBe(400);
    expect((await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, { content: '' })).status).toBe(400);

    const stranger = await e2e.createUser();
    const strangerPerson = (await e2e.db.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, 'X', 'x', 'person', '{}', array_fill(0.1, ARRAY[768])::vector) RETURNING id`,
      [stranger.id],
    )).rows[0].id;
    expect((await e2e.http('PATCH', `/actions/${items[0].id}`, owner.token, { assignee_entity_id: strangerPerson })).status).toBe(404);
    expect((await get(`/meetings/${meetingId}/summary`, stranger.token)).status).toBe(404);
    expect((await get(`/meetings/${meetingId}/actions`, stranger.token)).status).toBe(404);
    expect((await e2e.http('POST', `/meetings/${meetingId}/actions`, stranger.token, { content: 'x' })).status).toBe(404);
    expect((await e2e.http('PATCH', `/actions/${items[0].id}`, stranger.token, { status: 'done' })).status).toBe(404);
    expect((await e2e.http('DELETE', `/actions/${items[0].id}`, stranger.token)).status).toBe(404);
    expect((await get('/actions', stranger.token)).body).toEqual({ items: [], next_offset: null });
    expect((await get('/actions/filters', stranger.token)).body).toEqual({ open_total: 0, assignees: [], meetings: [] });
    expect((await get('/actions/not-a-uuid', stranger.token)).status).toBe(404);
  });
});
