import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import pgvector from 'pgvector/pg';
import { AppDataSource, registerPgVectorTypes } from '../../database/data-source.js';
import { VectorRepository } from '../../database/vector.repository.js';
import { fakeEmbedding } from '../../chunking/__tests__/fake-gemini.js';

const maybeDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const unit = (v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

maybeDescribe('semantic search over meeting_chunks (integration, real Postgres + pgvector)', () => {
  jest.setTimeout(120_000);
  const repo = new VectorRepository(AppDataSource);
  const users: string[] = [];

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      await registerPgVectorTypes(AppDataSource);
    }
  });
  afterAll(async () => {
    await AppDataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await AppDataSource.destroy();
  });

  async function user() {
    const id = randomUUID();
    users.push(id);
    await AppDataSource.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'S', 'x')`, [id, `s-${id}@meetio.test`]);
    return id;
  }
  async function meeting(userId: string, title: string, startedAt: string) {
    const [{ id }] = await AppDataSource.query(
      `INSERT INTO meetings (user_id, title, status, source_language, started_at) VALUES ($1, $2, 'ready', 'vi-VN', $3) RETURNING id`,
      [userId, title, startedAt],
    );
    return id as string;
  }
  async function chunk(meetingId: string, userId: string, content: string, seq: number) {
    await AppDataSource.query(
      `INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, token_count, content_hash, embedding)
       VALUES ($1, $2, $3, $4, $4, 10, $5, $6)`,
      [meetingId, userId, content, seq, randomUUID(), pgvector.toSql(unit(fakeEmbedding(content)))],
    );
  }
  const query = (text: string) => unit(fakeEmbedding(text));

  it('ranks the closest passage first and returns meeting context for jumping to it', async () => {
    const u = await user();
    const m = await meeting(u, 'Họp tài chính', '2026-09-10T02:00:00Z');
    await chunk(m, u, 'ngân sách quý sau tăng mười phần trăm', 42);
    await chunk(m, u, 'lịch nghỉ lễ của nhóm thiết kế', 90);
    const [top] = await repo.searchChunks(u, query('ngân sách quý sau'), { limit: 5, offset: 0 });
    expect(top).toMatchObject({ meetingId: m, meetingTitle: 'Họp tài chính', segmentStartSeq: 42 });
    expect(top.distance).toBeLessThan(0.5);
  });

  it("never returns another user's passage, however close it is", async () => {
    const a = await user();
    const b = await user();
    const ma = await meeting(a, 'A', '2026-09-10T02:00:00Z');
    const mb = await meeting(b, 'B', '2026-09-10T02:00:00Z');
    await chunk(mb, b, 'bí mật sáp nhập công ty', 1);
    await chunk(ma, a, 'chuyện khác hoàn toàn', 1);
    const rows = await repo.searchChunks(a, query('bí mật sáp nhập công ty'), { limit: 50, offset: 0 });
    expect(rows.map((r) => r.meetingId)).toEqual([ma]);
  });

  it('filters by meeting date, skips meetings the retention job soft-deleted, and skips un-embedded chunks', async () => {
    const u = await user();
    const early = await meeting(u, 'Tháng 8', '2026-08-01T02:00:00Z');
    const late = await meeting(u, 'Tháng 9', '2026-09-20T02:00:00Z');
    const gone = await meeting(u, 'Đã hết hạn', '2026-09-21T02:00:00Z');
    for (const m of [early, late, gone]) await chunk(m, u, 'kế hoạch tuyển dụng', 1);
    await AppDataSource.query('UPDATE meetings SET deleted_at = now() WHERE id = $1', [gone]);
    await AppDataSource.query(
      `INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, content_hash) VALUES ($1, $2, 'kế hoạch tuyển dụng', 5, 5, $3)`,
      [late, u, randomUUID()],
    );
    const rows = await repo.searchChunks(u, query('kế hoạch tuyển dụng'), { from: new Date('2026-09-01T00:00:00Z'), limit: 50, offset: 0 });
    expect(rows.map((r) => r.meetingId)).toEqual([late]);
  });

  async function seedNoise(owner: string, meetings: number, chunksPer: number) {
    await AppDataSource.query(
      `WITH ms AS (
         INSERT INTO meetings (user_id, title, status, source_language, started_at)
         SELECT $1, 'Noise ' || g, 'ready', 'vi-VN', now() FROM generate_series(1, $2) g RETURNING id
       )
       INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, token_count, content_hash, embedding)
       SELECT ms.id, $1, 'noise', c, c, 10, gen_random_uuid()::text,
              (SELECT ('[' || string_agg(round((random() * 2 - 1)::numeric, 4)::text, ',') || ']')::vector FROM generate_series(1, 768) WHERE c > 0)
       FROM ms, generate_series(1, $3) AS c`,
      [owner, meetings, chunksPer],
    );
  }

  it('never plans through the HNSW index — per-user search is an exact scan of the user\'s rows', async () => {
    const u = await user();
    const plan = (
      await AppDataSource.query(
        `EXPLAIN SELECT c.id FROM meeting_chunks c JOIN meetings m ON m.id = c.meeting_id
         WHERE c.user_id = $2 AND c.embedding IS NOT NULL AND m.deleted_at IS NULL
         ORDER BY (c.embedding <=> $1) + 0, c.id LIMIT 11`,
        [pgvector.toSql(query('bất kỳ')), u],
      )
    )
      .map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN'])
      .join('\n');
    expect(plan).not.toContain('idx_chunks_embedding');
  });

  it('keeps returning results after heavy churn (the case that emptied an HNSW-filtered search)', async () => {
    const u = await user();
    const noise = await user();
    await seedNoise(noise, 100, 20);
    await AppDataSource.query('DELETE FROM meetings WHERE user_id = $1', [noise]); // 2,000 dead rows, no VACUUM
    const m = await meeting(u, 'Sau khi dọn dữ liệu', '2026-09-10T02:00:00Z');
    await chunk(m, u, 'ngân sách quý sau', 7);
    const rows = await repo.searchChunks(u, query('ngân sách quý sau'), { limit: 5, offset: 0 });
    expect(rows.map((r) => r.segmentStartSeq)).toEqual([7]);
  });

  it('pages with limit/offset in a stable order', async () => {
    const u = await user();
    const m = await meeting(u, 'Nhiều đoạn', '2026-09-10T02:00:00Z');
    for (let i = 1; i <= 7; i++) await chunk(m, u, `đoạn số ${i} về dự án`, i);
    const q = query('dự án');
    const all = await repo.searchChunks(u, q, { limit: 7, offset: 0 });
    const paged = [...(await repo.searchChunks(u, q, { limit: 3, offset: 0 })), ...(await repo.searchChunks(u, q, { limit: 3, offset: 3 })), ...(await repo.searchChunks(u, q, { limit: 3, offset: 6 }))];
    expect(paged.map((r) => r.chunkId)).toEqual(all.map((r) => r.chunkId));
  });
});
