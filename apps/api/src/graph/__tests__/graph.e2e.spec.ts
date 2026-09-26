import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { scriptedModel } from '../../test-support/scripted-extraction-model.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };

const PROJECT = { name: 'Dự án ABC', type: 'project', description: 'dự án thanh toán' };
const MODEL = scriptedModel([
  { when: 'ABC', entities: [PROJECT] },
  { when: 'Bình', entities: [{ name: 'anh Bình', type: 'person' }] },
  { when: 'giới thiệu', entities: [PROJECT, { name: 'anh Bình', type: 'person' }], relations: [{ source: 'Bình', target: 'Dự án ABC', relationship: 'phụ trách' }] },
  { when: 'Payments', entities: [{ name: 'ABC Payments', type: 'project', description: 'dự án thanh toán' }] },
  { when: 'Lan', entities: [{ name: 'chị Lan', type: 'person' }] },
  { when: 'Minh', entities: [{ name: 'Minh', type: 'person' }, { name: 'Minh Tâm', type: 'person' }] },
]);

maybeDescribe('knowledge graph end to end (e2e, compiled server + fake Gemini over HTTP)', () => {
  jest.setTimeout(120_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  const meetings: string[] = [];

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
  const recordMeeting = async (title: string, lines: string[]) => {
    const id = (await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, title })).body.id as string;
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: lines.map((text, i) => ({ seq: i + 1, text, started_at_ms: i * 5000, ended_at_ms: i * 5000 + 4000 })),
    });
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: lines.length });
    await waitFor(async () => (await get(`/meetings/${id}/status`)).body, (s) => s.current_step === 'summarize');
    meetings.push(id);
    return id;
  };
  const byName = async (q: string) => (await get(`/entities?q=${encodeURIComponent(q)}`)).body.items;

  beforeAll(async () => {
    e2e = await startE2eApp({ ENTITY_SUGGEST_THRESHOLD: '0.6' });
    e2e.gemini.generate = MODEL;
    owner = await e2e.createUser();
    await recordMeeting('Kickoff', ['anh Bình giới thiệu ABC', 'lịch họp tuần']);
    await recordMeeting('Review', ['tiến độ ABC ổn định']);
    await recordMeeting('Chốt', ['ABC chốt ngân sách', 'chị Lan hỏi về Payments']);
  });
  afterAll(async () => e2e?.close());

  it('the pipeline runs extract and resolve, and one project named in three meetings is one entity', async () => {
    const res = await get('/entities?type=project');
    expect(res.status).toBe(200);
    const abc = res.body.items.find((e: { canonical_name: string }) => e.canonical_name === 'Dự án ABC');
    expect(abc).toMatchObject({ type: 'project', mention_count: 3, meeting_count: 3, last_mentioned_at: expect.any(String) });
    const { rows } = await e2e.db.query(`SELECT count(*)::int AS n FROM usage_records WHERE user_id = $1 AND operation = 'extract'`, [owner.id]);
    expect(rows[0].n).toBeGreaterThanOrEqual(3);
  });

  it('filters by type list and finds names without accents or honorifics', async () => {
    expect((await byName('binh')).map((e: { canonical_name: string }) => e.canonical_name)).toEqual(['anh Bình']);
    expect((await get('/entities?type=organization,product,other')).body.items).toEqual([]);
    expect((await get('/entities?type=task')).status).toBe(400);
  });

  it('shows relations that lead back to the transcript, the meetings, and a timeline in meeting order', async () => {
    const [binh] = await byName('Bình');
    const detail = (await get(`/entities/${binh.id}`)).body;
    expect(detail.relations).toEqual([
      expect.objectContaining({ direction: 'outgoing', relationship: 'phụ trách', other: expect.objectContaining({ canonical_name: 'Dự án ABC' }), meeting_id: meetings[0], segment_seq: 1 }),
    ]);
    const [abc] = await byName('Dự án ABC');
    const timeline = (await get(`/entities/${abc.id}/timeline?limit=2`)).body;
    expect(timeline.items.map((i: { meeting_id: string }) => i.meeting_id)).toEqual([meetings[0], meetings[1]]);
    expect(timeline.items[0]).toMatchObject({ meeting_title: 'Kickoff', segment_seq: 1, surface_form: 'Dự án ABC', excerpt: expect.stringContaining('ABC') });
    expect(timeline.next_offset).toBe(2);
  });

  it("draws one meeting's graph, and keeps every graph route away from other users", async () => {
    const graph = (await get(`/meetings/${meetings[0]}/graph`)).body;
    expect(graph.nodes.map((n: { canonical_name: string }) => n.canonical_name).sort()).toEqual(['Dự án ABC', 'anh Bình']);
    expect(graph.edges).toEqual([expect.objectContaining({ relationship: 'phụ trách', count: 1, segment_seq: 1 })]);

    const stranger = await e2e.createUser();
    const [abc] = await byName('Dự án ABC');
    expect((await get(`/meetings/${meetings[0]}/graph`, stranger.token)).status).toBe(404);
    expect((await get(`/entities/${abc.id}`, stranger.token)).status).toBe(404);
    expect((await get(`/entities/${abc.id}/timeline`, stranger.token)).status).toBe(404);
    expect((await e2e.http('PATCH', `/entities/${abc.id}`, stranger.token, { canonical_name: 'x' })).status).toBe(404);
    expect((await e2e.http('DELETE', `/entities/${abc.id}`, stranger.token)).status).toBe(404);
    expect((await get('/entities', stranger.token)).body.items).toEqual([]);
    expect((await get('/entities/merge-suggestions', stranger.token)).body.items).toEqual([]);
  });

  it('merges a suggested duplicate, keeps the old name findable, and splits it back', async () => {
    const suggestions = (await get('/entities/merge-suggestions')).body.items;
    const pair = suggestions.find((s: { a: { canonical_name: string }; b: { canonical_name: string } }) =>
      [s.a.canonical_name, s.b.canonical_name].includes('ABC Payments'),
    );
    expect(pair).toBeDefined();
    const [abc] = await byName('Dự án ABC');
    const [payments] = await byName('ABC Payments');

    const merged = await e2e.http('POST', '/entities/merge', owner.token, { keep_id: abc.id, merge_ids: [payments.id] });
    expect(merged.status).toBe(200);
    expect(merged.body.entity).toMatchObject({ id: abc.id, mention_count: 4, aliases: ['ABC Payments'], is_user_edited: true });
    expect(merged.body.merges).toEqual([expect.objectContaining({ merged_entity_id: payments.id, merged_name: 'ABC Payments' })]);
    expect((await get(`/entities/${payments.id}`)).status).toBe(404);
    expect((await byName('payments')).map((e: { id: string }) => e.id)).toEqual([abc.id]);
    expect((await get('/entities/merge-suggestions')).body.items.find((s: { id: string }) => s.id === pair.id)).toBeUndefined();

    const mergeId = merged.body.merges[0].id;
    const undone = await e2e.http('POST', `/entities/merge/${mergeId}/undo`, owner.token);
    expect(undone.status).toBe(200);
    expect(undone.body).toMatchObject({ id: abc.id, mention_count: 3, aliases: [], merges: [] });
    expect((await get(`/entities/${payments.id}`)).body).toMatchObject({ mention_count: 1 });
    expect((await e2e.http('POST', `/entities/merge/${mergeId}/undo`, owner.token)).status).toBe(409);
  });

  it('refuses to split a merge older than 30 days', async () => {
    const [abc] = await byName('Dự án ABC');
    const [payments] = await byName('ABC Payments');
    const merged = await e2e.http('POST', '/entities/merge', owner.token, { keep_id: abc.id, merge_ids: [payments.id] });
    await e2e.db.query(`UPDATE entity_merges SET created_at = now() - interval '31 days' WHERE id = $1`, [merged.body.merges[0].id]);
    const res = await e2e.http('POST', `/entities/merge/${merged.body.merges[0].id}/undo`, owner.token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect((await get(`/entities/${abc.id}`)).body.merges).toEqual([]);
  });

  it('renames keep the old name as an alias, and the next meeting does not overwrite the edit', async () => {
    const [binh] = await byName('Bình');
    const patched = await e2e.http('PATCH', `/entities/${binh.id}`, owner.token, { canonical_name: 'Trần Bình' });
    expect(patched.body).toMatchObject({ canonical_name: 'Trần Bình', aliases: ['anh Bình'], is_user_edited: true });

    await recordMeeting('Sync', ['anh Bình cập nhật ABC']);
    const after = (await get(`/entities/${binh.id}`)).body;
    expect(after).toMatchObject({ canonical_name: 'Trần Bình', mention_count: 2 });
    expect((await get('/entities?type=person&q=binh')).body.items).toHaveLength(1);
  });

  it('rejecting a suggestion removes it for good; deleting an entity removes its relations', async () => {
    const [lan] = await byName('Lan');
    const [binh] = await byName('Bình');
    const [a, b] = [lan.id, binh.id].sort();
    const { rows } = await e2e.db.query(
      'INSERT INTO entity_merge_suggestions (user_id, entity_a_id, entity_b_id, score) VALUES ($1, $2, $3, 0.7) RETURNING id',
      [owner.id, a, b],
    );
    expect((await e2e.http('POST', `/entities/merge-suggestions/${rows[0].id}/reject`, owner.token)).status).toBe(204);
    expect((await e2e.http('POST', `/entities/merge-suggestions/${rows[0].id}/reject`, owner.token)).status).toBe(404);
    const rejected = await e2e.db.query('SELECT 1 FROM entity_merge_rejections WHERE user_id = $1 AND entity_a_id = $2 AND entity_b_id = $3', [owner.id, a, b]);
    expect(rejected.rowCount).toBe(1);

    expect((await e2e.http('DELETE', `/entities/${binh.id}`, owner.token)).status).toBe(204);
    expect((await get(`/entities/${binh.id}`)).status).toBe(404);
    const [abc] = await byName('Dự án ABC');
    expect((await get(`/entities/${abc.id}`)).body.relations).toEqual([]);
  });

  it('deleting the only meeting that mentions a merged entity removes what was merged into it too', async () => {
    const id = await recordMeeting('Riêng', ['Minh và Minh Tâm trao đổi']);
    const [minh] = (await byName('minh')).filter((e: { canonical_name: string }) => e.canonical_name === 'Minh');
    const [tam] = await byName('Minh Tâm');
    expect((await e2e.http('POST', '/entities/merge', owner.token, { keep_id: minh.id, merge_ids: [tam.id] })).status).toBe(200);

    expect((await e2e.http('DELETE', `/meetings/${id}`, owner.token)).status).toBe(204);
    expect(await byName('minh')).toEqual([]);
    const { rows } = await e2e.db.query('SELECT count(*)::int AS n FROM entities WHERE id = ANY($1::uuid[])', [[minh.id, tam.id]]);
    expect(rows[0].n).toBe(0);
  });

  it('treats % and _ in the search text literally, not as LIKE wildcards', async () => {
    const [abc] = await byName('Dự án ABC');
    // Typing the name as it grows finds it, with or without the category word and accents.
    for (const typed of ['du an a', 'Dự án ABC', 'abc']) expect((await byName(typed)).map((e: { id: string }) => e.id)).toContain(abc.id);
    expect(await byName('%')).toEqual([]);
    expect(await byName('_')).toEqual([]);
    expect(await byName('du%abc')).toEqual([]);
  });

  it('timeline excerpt window is centered around the mention and does not exceed content length', async () => {
    const [abc] = await byName('Dự án ABC');
    const timeline = (await get(`/entities/${abc.id}/timeline?limit=1`)).body;
    expect(timeline.items.length).toBeGreaterThan(0);
    const item = timeline.items[0];
    // The excerpt is transcript text around the mention (the scripted model names it "Dự án ABC"; the transcript says "ABC").
    expect(item.excerpt).toContain('ABC');
    // Excerpt should not be excessively long (max ~280 chars + ellipsis based on code)
    expect(item.excerpt.length).toBeLessThanOrEqual(285);
    // If there's ellipsis, it should be present at appropriate boundaries
    if (item.excerpt.includes('…')) {
      expect([item.excerpt.startsWith('…'), item.excerpt.endsWith('…')].some((v) => v)).toBe(true);
    }
  });

  it('PATCH changing type re-normalizes the name for the new type', async () => {
    e2e.gemini.generate = scriptedModel([{ when: 'Quang', entities: [{ name: 'anh Quang', type: 'person' }] }]);
    await recordMeeting('Đổi loại', ['anh Quang trình bày']);
    e2e.gemini.generate = MODEL;
    const [quang] = await byName('Quang');
    expect(quang.type).toBe('person');

    const patched = await e2e.http('PATCH', `/entities/${quang.id}`, owner.token, { type: 'organization' });
    expect(patched.body).toMatchObject({ type: 'organization', canonical_name: 'anh Quang', is_user_edited: true });
    const { rows } = await e2e.db.query('SELECT normalized_name FROM entities WHERE id = $1', [quang.id]);
    expect(rows[0].normalized_name).toBe('anh quang'); // honorifics only drop for people
  });

  it('404 for malformed entity IDs in all routes (treated as ownership violation)', async () => {
    const malformed = 'not-a-uuid';
    // ParseUUIDPipe treats malformed IDs as ownership violations and returns 404 NOT_FOUND
    expect((await get(`/entities/${malformed}`)).status).toBe(404);
    expect((await get(`/entities/${malformed}/timeline`)).status).toBe(404);
    expect((await e2e.http('PATCH', `/entities/${malformed}`, owner.token, { canonical_name: 'x' })).status).toBe(404);
    expect((await e2e.http('DELETE', `/entities/${malformed}`, owner.token)).status).toBe(404);
    expect((await e2e.http('POST', `/entities/merge/${malformed}/undo`, owner.token)).status).toBe(404);
    expect((await e2e.http('POST', `/entities/merge-suggestions/${malformed}/reject`, owner.token)).status).toBe(404);
  });

  it('404 for entity IDs that do not belong to the current user', async () => {
    const stranger = await e2e.createUser();
    const [abc] = await byName('Dự án ABC');
    // Owner can access
    expect((await get(`/entities/${abc.id}`)).status).toBe(200);
    // Stranger cannot
    expect((await get(`/entities/${abc.id}`, stranger.token)).status).toBe(404);
    expect((await get(`/entities/${abc.id}/timeline`, stranger.token)).status).toBe(404);
    expect((await e2e.http('PATCH', `/entities/${abc.id}`, stranger.token, { canonical_name: 'x' })).status).toBe(404);
    expect((await e2e.http('DELETE', `/entities/${abc.id}`, stranger.token)).status).toBe(404);
  });

  it('rejects an empty search text instead of silently listing everything', async () => {
    expect((await get('/entities?q=')).status).toBe(400);
  });

  it('timeline pagination works correctly with offset and limit', async () => {
    const [abc] = await byName('Dự án ABC');
    const page1 = (await get(`/entities/${abc.id}/timeline?limit=1&offset=0`)).body;
    const page2 = (await get(`/entities/${abc.id}/timeline?limit=1&offset=1`)).body;
    expect(page1.items[0].meeting_id).not.toBe(page2.items[0]?.meeting_id);
    expect(page1.next_offset).toBe(1);
    expect(page2.next_offset).toBe(2); // ABC is mentioned in more than two meetings
  });

  it('entity list pagination respects limit and offset', async () => {
    const limit = 2;
    const page1 = (await get(`/entities?limit=${limit}`)).body;
    const page2 = (await get(`/entities?limit=${limit}&offset=${limit}`)).body;
    expect(page1.items.length).toBeLessThanOrEqual(limit);
    if (page1.next_offset !== null) {
      expect(page2.items.length).toBeGreaterThan(0);
      const ids1 = page1.items.map((e: { id: string }) => e.id);
      const ids2 = page2.items.map((e: { id: string }) => e.id);
      expect(ids1.every((id: string) => !ids2.includes(id))).toBe(true); // No overlap
    }
  });

  it('a meeting delete waits for the graph lock, so an entity that just gained a mention elsewhere survives', async () => {
    e2e.gemini.generate = scriptedModel([{ when: 'Hoa', entities: [{ name: 'chị Hoa', type: 'person' }] }]);
    const doomed = await recordMeeting('Sắp xóa', ['chị Hoa nói về lịch']);
    const other = await recordMeeting('Khác', ['lịch họp']);
    e2e.gemini.generate = MODEL;
    const [hoa] = await byName('Hoa');

    // Stand in for a resolve step of another meeting: hold the user's graph lock and attach a new mention.
    const resolver = await e2e.db.connect();
    try {
      await resolver.query('BEGIN');
      await resolver.query(`SELECT pg_advisory_xact_lock(hashtextextended('graph:' || $1, 0))`, [owner.id]);
      let settled = false;
      const deletion = e2e.http('DELETE', `/meetings/${doomed}`, owner.token).then((r) => ((settled = true), r));
      await new Promise((r) => setTimeout(r, 400));
      expect(settled).toBe(false); // blocked on the lock

      const { rows } = await resolver.query('SELECT id FROM meeting_chunks WHERE meeting_id = $1 LIMIT 1', [other]);
      await resolver.query('INSERT INTO entity_mentions (entity_id, meeting_id, chunk_id, surface_form) VALUES ($1, $2, $3, $4)', [hoa.id, other, rows[0].id, 'Hoa']);
      await resolver.query('COMMIT');

      expect((await deletion).status).toBe(204);
    } finally {
      resolver.release();
    }
    expect((await get(`/entities/${hoa.id}`)).body).toMatchObject({ canonical_name: 'chị Hoa', mention_count: 1 });
  });
});
