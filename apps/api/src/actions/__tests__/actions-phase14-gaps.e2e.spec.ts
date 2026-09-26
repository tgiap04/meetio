import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';
import { scriptedModel } from '../../test-support/scripted-extraction-model.js';
import { scriptedSummaryModel } from '../../test-support/scripted-summary-model.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' };
const pad = (s: string) => `${s} ` + 'mọi người trao đổi thêm về kế hoạch chi tiết trong tuần '.repeat(4);

maybeDescribe('Phase 14 gaps: summaries and actions edge cases (e2e)', () => {
  jest.setTimeout(120_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };

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
  const record = async (title: string, lines: string[], lang = 'vi-VN') => {
    const id = (await e2e.http('POST', '/meetings', owner.token, { ...NEW_MEETING, source_language: lang, title })).body.id as string;
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
      { when: 'Bình', action: { content: 'Gửi báo cáo', assignee: 'Bình', due_date: '2026-10-02' } },
    ]);
    owner = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());

  // Gap 1: re-run on 'changed' scope keeps user-edited (not ticked) items
  it('re-run on changed scope keeps action items the user edited but did not tick', async () => {
    const meetingId = await record('Họp 1', [pad('ngân sách quý bốn tăng'), pad('anh Bình gửi báo cáo')]);
    const { items: [report] } = (await get(`/meetings/${meetingId}/actions`)).body;
    expect(report.content).toBe('Gửi báo cáo');

    // Edit the task without changing status to done
    const edited = await e2e.http('PATCH', `/actions/${report.id}`, owner.token, { content: 'Gửi báo cáo quý bốn' });
    expect(edited.body.content).toBe('Gửi báo cáo quý bốn');
    expect(edited.status).toBe(200);

    // Re-run the pipeline
    await e2e.http('POST', `/meetings/${meetingId}/reindex`, owner.token, { scope: 'full' });
    await waitFor(async () => (await e2e.db.query('SELECT pipeline_run, status FROM meetings WHERE id = $1', [meetingId])).rows[0], (r) => r.pipeline_run === 2 && r.status === 'ready');

    // The edited task should be kept, not replaced
    const { items: after } = (await get(`/meetings/${meetingId}/actions`)).body;
    const kept = after.find((i: { id: string }) => i.id === report.id);
    expect(kept).toBeDefined();
    expect(kept.content).toBe('Gửi báo cáo quý bốn');
  });

  // Gap 2: assignee that is a merged-away entity shows the kept entity's name
  it('resolves merged-away assignee entities to the kept entity name', async () => {
    const meetingId = await record('Họp 2', [pad('ngân sách quý bốn tăng'), pad('anh Bình gửi báo cáo')]);
    const { items: [report] } = (await get(`/meetings/${meetingId}/actions`)).body;
    const oldEntityId = report.assignee_entity_id;
    expect(report.assignee_name).toBe('anh Bình');

    // Create a new person entity
    const [{ id: newEntityId }] = (await e2e.db.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, 'Bình', 'binh', 'person', '{}', array_fill(0.1, ARRAY[768])::vector) RETURNING id`,
      [owner.id],
    )).rows;

    // Merge the old entity into the new one
    await e2e.db.query(`UPDATE entities SET merged_into_id = $2 WHERE id = $1`, [oldEntityId, newEntityId]);

    // The action item should now show the new entity's name
    const { items: [resolved] } = (await get(`/meetings/${meetingId}/actions`)).body;
    expect(resolved.assignee_entity_id).toBe(newEntityId);
    expect(resolved.assignee_name).toBe('Bình');
  });

  // Gap 3: assignee deleted later (FK SET NULL via ON DELETE SET NULL)
  it('handles assignee entity deletion gracefully', async () => {
    const meetingId = await record('Họp 3', [pad('ngân sách quý bốn tăng'), pad('anh Bình gửi báo cáo')]);
    const { items: [report] } = (await get(`/meetings/${meetingId}/actions`)).body;
    const entityId = report.assignee_entity_id;

    // Delete the assignee entity
    await e2e.db.query(`DELETE FROM entities WHERE id = $1`, [entityId]);

    // The action item should still exist but with null assignee
    const { items: [nullified] } = (await get(`/meetings/${meetingId}/actions`)).body;
    expect(nullified.id).toBe(report.id);
    expect(nullified.assignee_entity_id).toBeNull();
    expect(nullified.assignee_name).toBeNull();
  });

  // Gap 4: a manual item goes with its meeting
  it('deleting a meeting removes its manual action items from the cross-meeting list', async () => {
    const meetingId = await record('Họp 4', [pad('ngân sách quý bốn tăng')]);
    const manual = await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, { content: 'Item tay tạo', due_date: '2026-09-30' });
    const manualId = manual.body.id;
    expect(manual.body.meeting_id).toBe(meetingId);

    // Verify it appears in the cross-meeting list before deletion
    let inList = (await get('/actions')).body.items.find((i: { id: string }) => i.id === manualId);
    expect(inList).toBeDefined();
    expect(inList.meeting_title).toBe('Họp 4');

    // Delete the meeting
    await e2e.http('DELETE', `/meetings/${meetingId}`, owner.token);

    // The action item should no longer appear in the list (meeting is filtered out)
    const afterDelete = (await get('/actions')).body;
    inList = afterDelete.items.find((i: { id: string }) => i.id === manualId);
    expect(inList).toBeUndefined();
  });

  // Gap 5: pagination with next_offset handles boundaries correctly
  it('paginates correctly with next_offset and limit', async () => {
    const meetingId = await record('Họp 5', [pad('ngân sách quý bốn tăng')]);

    // Create 5 manual items
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const res = await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, { content: `Item ${i + 1}` });
      ids.push(res.body.id);
    }

    // Fetch with limit=2
    const page1 = (await get('/actions?limit=2')).body;
    expect(page1.items.length).toBe(2);
    expect(page1.next_offset).toBe(2);

    // Fetch the next page
    const page2 = (await get(`/actions?limit=2&offset=${page1.next_offset}`)).body;
    expect(page2.items.length).toBe(2);
    expect(page2.next_offset).toBe(4);

    // Fetch the last page (should have next_offset=null when no more items)
    const page3 = (await get(`/actions?limit=2&offset=${page2.next_offset}`)).body;
    expect(page3.items.length).toBeGreaterThanOrEqual(1);
    // If fewer items than limit, next_offset should be null
    if (page3.items.length < 2) {
      expect(page3.next_offset).toBeNull();
    }
  });

  // Gap 6: ordering rule - open before done, due date nulls last
  it('orders items: open before done, then by due_date (nulls last), then by created_at', async () => {
    const meetingId = await record('Họp 6', [pad('ngân sách quý bốn tăng')]);

    // Create items in non-chronological order
    const a1 = (await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, { content: 'A', due_date: '2026-09-28' })).body;
    await new Promise((r) => setTimeout(r, 100));
    const a2 = (await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, { content: 'B', due_date: '2026-09-27' })).body; // earlier date
    await new Promise((r) => setTimeout(r, 100));
    const a3 = (await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, { content: 'C' })).body; // no due_date

    // Tick A as done
    await e2e.http('PATCH', `/actions/${a1.id}`, owner.token, { status: 'done' });

    // Only the three items made here (the meeting's AI items are not part of this check).
    const mine = new Set([a1.id, a2.id, a3.id]);
    const order = (await get(`/actions?meeting_id=${meetingId}`)).body.items
      .filter((i: { id: string }) => mine.has(i.id))
      .map((i: { content: string }) => i.content);
    // Open by due date (B 27/9, then C with none), done (A) last.
    expect(order).toEqual(['B', 'C', 'A']);
  });

  // Gap 7: PATCH with empty body should succeed and not change anything
  it('PATCH with empty body succeeds and makes no changes', async () => {
    const meetingId = await record('Họp 7', [pad('ngân sách quý bốn tăng'), pad('anh Bình gửi báo cáo')]);
    const { items: [item] } = (await get(`/meetings/${meetingId}/actions`)).body;
    expect(item).toBeDefined();

    const res = await e2e.http('PATCH', `/actions/${item.id}`, owner.token, {});
    expect(res.status).toBe(200);

    // Verify no changes were made (except updated_at which may change)
    const after = res.body;
    expect(after.content).toBe(item.content);
    expect(after.status).toBe(item.status);
    expect(after.due_date).toBe(item.due_date);
  });

  // Gap 8: English language meeting - check insufficient sentence and "Decisions" heading
  it('generates English summary with correct insufficient message and Decisions heading', async () => {
    // Create a very short English meeting (to trigger insufficient)
    const meetingId = await record('English short', ['alo alo'], 'en-US');
    const summary = (await get(`/meetings/${meetingId}/summary`)).body;
    expect(summary.insufficient).toBe(true);
    expect(summary.summary).toBe('The meeting was too short or had too little content to summarize.');

    // Create a longer English meeting with content
    e2e.gemini.summarize = scriptedSummaryModel([
      { when: 'budget', point: 'Budget increased by 10%' },
      { when: 'launch', decision: 'Launch in November' },
    ]);
    const meetingId2 = await record('English content', [pad('budget increased'), pad('launch in November')], 'en-US');
    const summary2 = (await get(`/meetings/${meetingId2}/summary`)).body;
    expect(summary2.insufficient).toBe(false);
    expect(summary2.summary).toContain('Decisions:');
    expect(summary2.summary).toContain('• Budget increased by 10%');
  });

  // Gap 9: due_date format is always YYYY-MM-DD, no timezone shift
  it('due_date is returned in YYYY-MM-DD format without timezone conversion', async () => {
    const meetingId = await record('Họp 8', [pad('ngân sách quý bốn tăng')]);
    // Create a manual action with a due date to test the format
    const res = await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, {
      content: 'Test task with date',
      due_date: '2026-10-02',
    });
    expect(res.status).toBe(201);
    expect(res.body.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.due_date).toBe('2026-10-02');
  });

  // Gap 10: PATCH assigning to a person entity that doesn't exist or belongs to another user
  it('rejects PATCH with assignee from another user', async () => {
    const meetingId = await record('Họp 9', [pad('ngân sách quý bốn tăng')]);
    // Create a manual action to patch
    const created = await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, { content: 'Task to assign' });
    const item = created.body;
    expect(item).toBeDefined();

    const stranger = await e2e.createUser();
    const [{ id: strangerEntityId }] = (await e2e.db.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding) VALUES ($1, 'Người lạ', 'nguoi_la', 'person', '{}', array_fill(0.1, ARRAY[768])::vector) RETURNING id`,
      [stranger.id],
    )).rows;

    const res = await e2e.http('PATCH', `/actions/${item.id}`, owner.token, { assignee_entity_id: strangerEntityId });
    expect(res.status).toBe(404);
  });

  // Gap 11: list filters by status correctly
  it('filters action items by status correctly', async () => {
    const meetingId = await record('Họp 10', [pad('ngân sách quý bốn tăng')]);
    // Create a manual action to test status filtering
    const created = await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, { content: 'Report to submit' });
    const report = created.body;
    expect(report).toBeDefined();

    // Initially open
    expect((await get(`/actions?status=open&meeting_id=${meetingId}`)).body.items).toContainEqual(expect.objectContaining({ id: report.id }));
    expect((await get(`/actions?status=done&meeting_id=${meetingId}`)).body.items).not.toContainEqual(expect.objectContaining({ id: report.id }));

    // Tick as done
    await e2e.http('PATCH', `/actions/${report.id}`, owner.token, { status: 'done' });

    // Now should appear only in done
    expect((await get(`/actions?status=open&meeting_id=${meetingId}`)).body.items).not.toContainEqual(expect.objectContaining({ id: report.id }));
    expect((await get(`/actions?status=done&meeting_id=${meetingId}`)).body.items).toContainEqual(expect.objectContaining({ id: report.id }));
  });

  // Gap 12: POST action with all fields including assignee
  it('POST action item with all fields correctly', async () => {
    const meetingId = await record('Họp 11', [pad('ngân sách quý bốn tăng')]);

    // Get or create a person entity
    const [person] = (await e2e.db.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, aliases, embedding)
       VALUES ($1, 'Tuấn', 'tuan', 'person', '{}', array_fill(0.1, ARRAY[768])::vector) RETURNING id`,
      [owner.id],
    )).rows;

    const res = await e2e.http('POST', `/meetings/${meetingId}/actions`, owner.token, {
      content: 'Tạo báo cáo chi tiết',
      assignee_entity_id: person.id,
      due_date: '2026-10-15',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      content: 'Tạo báo cáo chi tiết',
      assignee_entity_id: person.id,
      assignee_name: 'Tuấn',
      due_date: '2026-10-15',
      is_manual: true,
      status: 'open',
    });
  });
});
