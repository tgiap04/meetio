import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = {
  source_language: 'vi-VN',
  audio_source: 'device_mic',
  recording_quality: 'high',
};

maybeDescribe('meeting list, detail and rename (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };
  let stranger: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
    stranger = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());

  const create = async (token: string, title: string) =>
    (await e2e.http('POST', '/meetings', token, { ...NEW_MEETING, title })).body.id as string;

  const listAll = async (token: string, query: string) => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await e2e.http(
        'GET',
        `/meetings?${query}${cursor ? `&cursor=${cursor}` : ''}`,
        token,
      );
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((m: { id: string }) => m.id));
      cursor = res.body.next_cursor;
    } while (cursor);
    return seen;
  };

  it('pages newest first without gaps or duplicates — even when rows share a microsecond', async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await create(owner.token, `Trang ${i}`));
    // Force a tie on created_at: keyset pagination must fall back to id, not drop a row.
    await e2e.db.query(
      `UPDATE meetings SET created_at = '2026-01-01T00:00:00.123456Z' WHERE id = ANY($1::uuid[])`,
      [ids.slice(1, 4)],
    );
    const seen = await listAll(owner.token, 'limit=2');
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...ids].sort());
  });

  it("never lists another user's meetings", async () => {
    const theirs = await create(stranger.token, 'Của người khác');
    expect(await listAll(owner.token, 'limit=100')).not.toContain(theirs);
  });

  it('searches titles accent- and case-insensitively', async () => {
    const id = await create(owner.token, 'Họp Dự Án Meetio');
    const res = await e2e.http(
      'GET',
      `/meetings?q=${encodeURIComponent('hop du an')}`,
      owner.token,
    );
    expect(res.body.items.map((m: { id: string }) => m.id)).toEqual([id]);
  });

  it('treats LIKE wildcards in q as plain text', async () => {
    await create(owner.token, 'Không có ký tự đặc biệt');
    const res = await e2e.http('GET', `/meetings?q=${encodeURIComponent('%')}`, owner.token);
    expect(res.body.items).toEqual([]);
  });

  it('filters by status and by created_at range', async () => {
    const paused = await create(owner.token, 'Đang tạm dừng');
    await e2e.http('POST', `/meetings/${paused}/pause`, owner.token);
    const byStatus = await e2e.http('GET', '/meetings?status=paused', owner.token);
    expect(byStatus.body.items.map((m: { id: string }) => m.id)).toEqual([paused]);

    const future = await e2e.http('GET', '/meetings?from=2999-01-01T00:00:00Z', owner.token);
    expect(future.body.items).toEqual([]);
  });

  it('hides meetings the retention job soft-deleted', async () => {
    const id = await create(owner.token, 'Hết hạn lưu trữ');
    await e2e.db.query('UPDATE meetings SET deleted_at = now() WHERE id = $1', [id]);
    expect(await listAll(owner.token, 'limit=100')).not.toContain(id);
    expect((await e2e.http('GET', `/meetings/${id}`, owner.token)).status).toBe(404);
  });

  it('rejects a tampered cursor and an out-of-range limit with 400', async () => {
    expect((await e2e.http('GET', '/meetings?cursor=abc', owner.token)).body.error.code).toBe(
      'VALIDATION_ERROR',
    );
    expect((await e2e.http('GET', '/meetings?limit=500', owner.token)).status).toBe(400);
  });

  it('returns detail with segment count, action items and ordered processing steps', async () => {
    const id = await create(owner.token, 'Chi tiết');
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [1, 2, 3].map((seq) => ({
        seq,
        text: `câu ${seq}`,
        started_at_ms: seq * 1000,
        ended_at_ms: seq * 1000 + 500,
      })),
    });
    await e2e.db.query(
      `INSERT INTO action_items (meeting_id, user_id, content, is_manual) VALUES ($1, $2, 'Gửi báo cáo', true)`,
      [id, owner.id],
    );
    await e2e.db.query(
      `INSERT INTO processing_jobs (meeting_id, step, status) VALUES ($1, 'summarize', 'pending'), ($1, 'chunk', 'succeeded')`,
      [id],
    );
    const res = await e2e.http('GET', `/meetings/${id}`, owner.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      title: 'Chi tiết',
      recording_quality: 'high',
      segment_count: 3,
      action_items: [{ content: 'Gửi báo cáo', status: 'open', is_manual: true }],
      processing_steps: [
        { step: 'chunk', status: 'succeeded' },
        { step: 'summarize', status: 'pending' },
      ],
    });
    expect(res.body).not.toHaveProperty('segments');
    expect(res.body).not.toHaveProperty('user_id');
  });

  it("renames and changes the translation target, but not someone else's meeting", async () => {
    const id = await create(owner.token, 'Tên cũ');
    const res = await e2e.http('PATCH', `/meetings/${id}`, owner.token, {
      title: '  Tên mới  ',
      translate_to: 'en',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Tên mới', translate_to: 'en' });
    const off = await e2e.http('PATCH', `/meetings/${id}`, owner.token, { translate_to: null });
    expect(off.body.translate_to).toBeNull();
    expect(
      (await e2e.http('PATCH', `/meetings/${id}`, stranger.token, { title: 'x' })).status,
    ).toBe(404);
    // US-25: an emptied title falls back to the default, it is not rejected.
    const blank = await e2e.http('PATCH', `/meetings/${id}`, owner.token, { title: '' });
    expect(blank.status).toBe(200);
    expect(blank.body.title).toMatch(/^Cuộc họp \d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});
