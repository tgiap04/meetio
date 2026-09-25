import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = {
  source_language: 'vi-VN',
  audio_source: 'device_mic',
  recording_quality: 'standard',
};
const seg = (seq: number, text = `đoạn ${seq}`) => ({
  seq,
  text,
  started_at_ms: seq * 1000,
  ended_at_ms: seq * 1000 + 900,
});

maybeDescribe('meeting lifecycle gaps coverage (e2e)', () => {
  let e2e: E2eApp;
  let owner: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());
  jest.setTimeout(60_000);

  const create = async (body: object = NEW_MEETING) =>
    (await e2e.http('POST', '/meetings', owner.token, body)).body.id as string;

  it('rejects bulk requests with >1000 segments', async () => {
    const id = await create();
    const tooMany = Array.from({ length: 1001 }, (_, i) => seg(i + 1));
    const res = await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: tooMany,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET after end shows status queued and duration_sec', async () => {
    const id = await create();
    await e2e.db.query(
      `UPDATE meetings SET started_at = now() - interval '300 seconds' WHERE id = $1`,
      [id],
    );
    const ended = await e2e.http('POST', `/meetings/${id}/end`, owner.token, {});
    expect(ended.body.status).toBe('queued');
    expect(ended.body.duration_sec).toBeGreaterThanOrEqual(299);

    const detail = await e2e.http('GET', `/meetings/${id}`, owner.token);
    expect(detail.body.status).toBe('queued');
    expect(detail.body.duration_sec).toBeGreaterThanOrEqual(299);
  });

  it('PATCH strips unknown fields (only accepts title and translate_to)', async () => {
    const id = await create();
    const res = await e2e.http('PATCH', `/meetings/${id}`, owner.token, {
      title: 'Tên mới',
      translate_to: 'en',
      recording_quality: 'high', // Unknown field, should be ignored
      status: 'ended', // Unknown field, should be ignored
    });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Tên mới');
    expect(res.body.translate_to).toBe('en');

    const detail = await e2e.http('GET', `/meetings/${id}`, owner.token);
    expect(detail.body.recording_quality).toBe('standard'); // Unchanged
    expect(detail.body.status).toBe('recording'); // Unchanged
  });

  it('abandoned sweep ignores soft-deleted meetings', async () => {
    const idle = await create();
    const deleted = await create();
    await e2e.db.query(
      `UPDATE meetings SET started_at = now() - interval '26 hours', last_activity_at = now() - interval '25 hours'
       WHERE id = ANY($1::uuid[])`,
      [[idle, deleted]],
    );
    await e2e.db.query(`UPDATE meetings SET deleted_at = now() WHERE id = $1`, [deleted]);

    const closed = await e2e.runMaintenance('close-abandoned-meetings');
    expect(closed).toBeGreaterThanOrEqual(1); // Only idle, not deleted

    const deletedRow = await e2e.db.query('SELECT status FROM meetings WHERE id = $1', [deleted]);
    expect(deletedRow.rows[0].status).toBe('recording'); // Should not have been auto-ended
  });

  it('list filters by to date (created_at <= to)', async () => {
    const old = await create();
    await e2e.db.query(`UPDATE meetings SET created_at = '2024-01-01T00:00:00Z' WHERE id = $1`, [
      old,
    ]);
    const recent = await create();

    const beforeOld = await e2e.http('GET', `/meetings?to=2023-12-31T23:59:59Z`, owner.token);
    expect(beforeOld.body.items).toEqual([]);

    const includeOld = await e2e.http('GET', `/meetings?to=2024-06-01T00:00:00Z`, owner.token);
    expect(includeOld.body.items.map((m: { id: string }) => m.id)).toEqual([old]);
    expect(
      (await e2e.http('GET', '/meetings?limit=100', owner.token)).body.items.map(
        (m: { id: string }) => m.id,
      ),
    ).toContain(recent);
  });

  it('end with last_seq succeeds once every seq up to it was synced over bulk', async () => {
    const id = await create();
    // bulk writes straight through the upsert repository (not the WS batch writer)
    await e2e.http('POST', `/meetings/${id}/segments/bulk`, owner.token, {
      segments: [seg(1), seg(2)],
    });
    const ended = await e2e.http('POST', `/meetings/${id}/end`, owner.token, { last_seq: 2 });
    expect(ended.status).toBe(200);
    expect(ended.body.status).toBe('queued');
  });

  it('pause→end while paused calculates duration excluding pause time', async () => {
    const id = await create();
    // Start: T=0
    await e2e.db.query(
      `UPDATE meetings SET started_at = now() - interval '600 seconds' WHERE id = $1`,
      [id],
    );
    // Pause at T=300s
    await e2e.http('POST', `/meetings/${id}/pause`, owner.token);
    // Record paused_at at T=300s, then advance
    await e2e.db.query(
      `UPDATE meetings SET paused_at = now() - interval '100 seconds' WHERE id = $1`,
      [id],
    );
    // Resume at T=400s (100s paused)
    await e2e.http('POST', `/meetings/${id}/resume`, owner.token);
    // End at T=600s
    const ended = await e2e.http('POST', `/meetings/${id}/end`, owner.token, {});
    // Duration should be ~500s (600s - 100s pause), not 600s
    expect(ended.body.duration_sec).toBeGreaterThanOrEqual(499);
    expect(ended.body.duration_sec).toBeLessThanOrEqual(502);
  });
});
