import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;
const NEW_MEETING = {
  source_language: 'vi-VN',
  audio_source: 'device_mic',
  recording_quality: 'standard',
};
const ZERO_VECTOR = `array_fill(0, ARRAY[768])::vector`;

maybeDescribe('meeting delete and maintenance sweeps (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());

  const create = async () =>
    (await e2e.http('POST', '/meetings', owner.token, NEW_MEETING)).body.id as string;

  async function seedDerivedData(meetingId: string) {
    const q = (sql: string, params: unknown[]) => e2e.db.query(sql, params).then((r) => r.rows);
    await q(
      `INSERT INTO transcript_segments (meeting_id, seq, text, started_at_ms, ended_at_ms) VALUES ($1, 1, 'a', 0, 1)`,
      [meetingId],
    );
    const [chunk] = await q(
      `INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, token_count, embedding)
       VALUES ($1, $2, 'a', 1, 1, 1, ${ZERO_VECTOR}) RETURNING id`,
      [meetingId, owner.id],
    );
    const entity = async (name: string) =>
      (
        await q(
          `INSERT INTO entities (user_id, canonical_name, normalized_name, type, embedding) VALUES ($1, $2, $2, 'person', ${ZERO_VECTOR}) RETURNING id`,
          [owner.id, name],
        )
      )[0].id as string;
    const mention = (entityId: string, mId: string, chunkId: string) =>
      q(
        `INSERT INTO entity_mentions (entity_id, meeting_id, chunk_id, surface_form) VALUES ($1, $2, $3, 'x')`,
        [entityId, mId, chunkId],
      );
    return { chunkId: chunk.id as string, entity, mention, q };
  }

  it('deletes physically, cascades to every table that references meetings, and removes orphaned entities only', async () => {
    const doomed = await create();
    const survivor = await create();
    const { chunkId, entity, mention, q } = await seedDerivedData(doomed);
    const { chunkId: survivorChunk } = await seedDerivedData(survivor);

    const onlyHere = await entity('Chỉ ở cuộc họp bị xóa');
    const shared = await entity('Có ở cả hai cuộc họp');
    const untouched = await entity('Không có mention nào'); // not this delete's business
    await mention(onlyHere, doomed, chunkId);
    await mention(shared, doomed, chunkId);
    await mention(shared, survivor, survivorChunk);
    await q(
      `INSERT INTO relations (user_id, source_entity_id, target_entity_id, relationship, meeting_id, chunk_id, confidence)
       VALUES ($1, $2, $3, 'works_with', $4, $5, 0.9)`,
      [owner.id, onlyHere, shared, doomed, chunkId],
    );
    await q(`INSERT INTO action_items (meeting_id, user_id, content) VALUES ($1, $2, 'x')`, [
      doomed,
      owner.id,
    ]);
    await q(
      `INSERT INTO qa_messages (user_id, meeting_id, role, content) VALUES ($1, $2, 'user', 'x')`,
      [owner.id, doomed],
    );
    await q(`INSERT INTO processing_jobs (meeting_id, step) VALUES ($1, 'chunk')`, [doomed]);

    const res = await e2e.http('DELETE', `/meetings/${doomed}`, owner.token);
    expect(res.status).toBe(204);

    // Every FK column pointing at meetings(id), discovered from the catalog — a
    // table added later is checked without anyone remembering to list it here.
    const fks = await q(
      `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
       WHERE c.contype = 'f' AND c.confrelid = 'meetings'::regclass`,
      [],
    );
    expect(fks.length).toBeGreaterThanOrEqual(7);
    for (const { tbl, col } of fks) {
      const [{ n }] = await q(`SELECT count(*)::int AS n FROM ${tbl} WHERE ${col} = $1`, [doomed]);
      expect({ tbl, n }).toEqual({ tbl, n: 0 });
    }
    expect((await q('SELECT count(*)::int AS n FROM meetings WHERE id = $1', [doomed]))[0].n).toBe(
      0,
    );

    const remaining = (
      await q('SELECT id FROM entities WHERE id = ANY($1::uuid[])', [[onlyHere, shared, untouched]])
    ).map((r: { id: string }) => r.id);
    expect(remaining.sort()).toEqual([shared, untouched].sort());
    expect((await e2e.http('GET', `/meetings/${survivor}`, owner.token)).status).toBe(200);
    expect((await e2e.http('GET', `/meetings/${doomed}`, owner.token)).status).toBe(404);
    expect((await e2e.http('DELETE', `/meetings/${doomed}`, owner.token)).status).toBe(404);
  });

  it('auto-ends recording and paused meetings idle for 24h, measures up to the last activity, and queues them', async () => {
    const idleRecording = await create();
    const idlePaused = await create();
    const fresh = await create();
    await e2e.http('POST', `/meetings/${idlePaused}/pause`, owner.token);
    await e2e.db.query(
      `UPDATE meetings SET started_at = now() - interval '26 hours', last_activity_at = now() - interval '25 hours'
       WHERE id = ANY($1::uuid[])`,
      [[idleRecording, idlePaused]],
    );

    const closed = await e2e.runMaintenance('close-abandoned-meetings');
    expect(closed).toBeGreaterThanOrEqual(2);

    const rows = (
      await e2e.db.query(
        "SELECT id, status, duration_sec, ended_at < now() - interval '24 hours' AS ended_long_ago FROM meetings WHERE id = ANY($1::uuid[])",
        [[idleRecording, idlePaused, fresh]],
      )
    ).rows;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[idleRecording]).toMatchObject({
      status: 'queued',
      duration_sec: 3600,
      ended_long_ago: true,
    });
    expect(byId[idlePaused].status).toBe('queued');
    expect(byId[fresh].status).toBe('recording');
    expect(await e2e.processingQueue.getJob(idleRecording)).toBeDefined();
  });

  it('re-enqueues a queued meeting whose pipeline job never reached Redis', async () => {
    const id = await create();
    await e2e.http('POST', `/meetings/${id}/end`, owner.token, {});
    await e2e.processingQueue.remove(id);
    await e2e.db.query(
      `UPDATE meetings SET updated_at = now() - interval '11 minutes' WHERE id = $1`,
      [id],
    );
    expect(await e2e.processingQueue.getJob(id)).toBeUndefined();

    await e2e.runMaintenance('requeue-stranded-meetings');
    expect((await e2e.processingQueue.getJob(id))?.data).toEqual({ meeting_id: id });
  });
});
