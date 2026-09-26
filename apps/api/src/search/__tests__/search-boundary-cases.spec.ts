import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import pgvector from 'pgvector/pg';
import { AppDataSource, registerPgVectorTypes } from '../../database/data-source.js';
import { VectorRepository } from '../../database/vector.repository.js';
import { fakeEmbedding } from '../../chunking/__tests__/fake-gemini.js';

const maybeDescribe = process.env.DATABASE_URL ? describe : describe.skip;

const unit = (v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

maybeDescribe('search boundary cases', () => {
  jest.setTimeout(30_000);
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
    await AppDataSource.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'S', 'x')`, [
      id,
      `search-boundary-${id}@meetio.test`,
    ]);
    return id;
  }

  async function meeting(userId: string, title: string, startedAt: Date) {
    const [{ id }] = await AppDataSource.query(
      `INSERT INTO meetings (user_id, title, status, source_language, started_at) VALUES ($1, $2, 'ready', 'vi-VN', $3) RETURNING id`,
      [userId, title, startedAt]
    );
    return id as string;
  }

  async function chunk(meetingId: string, userId: string, content: string, seq: number) {
    await AppDataSource.query(
      `INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, token_count, content_hash, embedding)
       VALUES ($1, $2, $3, $4, $4, 10, $5, $6)`,
      [meetingId, userId, content, seq, randomUUID(), pgvector.toSql(unit(fakeEmbedding(content)))]
    );
  }

  it('filters by from/to boundaries on meeting started_at date', async () => {
    const u = await user();
    const before = new Date('2026-09-01T00:00:00Z');
    const inRange = new Date('2026-09-15T12:00:00Z');
    const after = new Date('2026-09-30T23:59:59Z');

    const mBefore = await meeting(u, 'Before', before);
    const mInRange = await meeting(u, 'InRange', inRange);
    const mAfter = await meeting(u, 'After', after);

    await chunk(mBefore, u, 'content before', 1);
    await chunk(mInRange, u, 'content in range', 1);
    await chunk(mAfter, u, 'content after', 1);

    const query = unit(fakeEmbedding('content'));
    const fromDate = new Date('2026-09-10T00:00:00Z');
    const toDate = new Date('2026-09-20T23:59:59Z');

    const results = await repo.searchChunks(u, query, { from: fromDate, to: toDate, limit: 10, offset: 0 });

    expect(results).toHaveLength(1);
    expect(results[0].meetingTitle).toBe('InRange');
  });

  it('returns empty array when offset exceeds total results', async () => {
    const u = await user();
    const m = await meeting(u, 'Small meeting', new Date('2026-09-15T00:00:00Z'));
    await chunk(m, u, 'only three chunks here', 1);
    await chunk(m, u, 'second chunk content', 2);
    await chunk(m, u, 'third chunk for test', 3);

    const query = unit(fakeEmbedding('chunks'));
    const results = await repo.searchChunks(u, query, { limit: 10, offset: 100 });

    expect(results).toEqual([]);
  });

  it('returns only available results when offset is near the end', async () => {
    const u = await user();
    const m = await meeting(u, 'Five chunk meeting', new Date('2026-09-15T00:00:00Z'));
    for (let i = 1; i <= 5; i++) {
      await chunk(m, u, `chunk number ${i}`, i);
    }

    const query = unit(fakeEmbedding('chunk'));
    const page1 = await repo.searchChunks(u, query, { limit: 3, offset: 0 });
    const page2 = await repo.searchChunks(u, query, { limit: 3, offset: 3 });

    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(2);
  });

  it('excludes soft-deleted meetings from search results', async () => {
    const u = await user();
    const active = await meeting(u, 'Active meeting', new Date('2026-09-15T00:00:00Z'));
    const deleted = await meeting(u, 'Deleted meeting', new Date('2026-09-15T00:00:00Z'));

    await chunk(active, u, 'active content searchable', 1);
    await chunk(deleted, u, 'deleted content should not appear', 1);

    // Soft-delete one meeting
    await AppDataSource.query('UPDATE meetings SET deleted_at = now() WHERE id = $1', [deleted]);

    const query = unit(fakeEmbedding('content'));
    const results = await repo.searchChunks(u, query, { limit: 10, offset: 0 });

    expect(results).toHaveLength(1);
    expect(results[0].meetingId).toBe(active);
  });

  it('respects both date and soft-delete filters together', async () => {
    const u = await user();
    const old = await meeting(u, 'Old', new Date('2026-08-01T00:00:00Z'));
    const current = await meeting(u, 'Current', new Date('2026-09-15T00:00:00Z'));
    const deleted = await meeting(u, 'Deleted Current', new Date('2026-09-15T00:00:00Z'));

    await chunk(old, u, 'old content', 1);
    await chunk(current, u, 'current content', 1);
    await chunk(deleted, u, 'deleted but current date', 1);

    await AppDataSource.query('UPDATE meetings SET deleted_at = now() WHERE id = $1', [deleted]);

    const query = unit(fakeEmbedding('content'));
    const from = new Date('2026-09-01T00:00:00Z');
    const results = await repo.searchChunks(u, query, { from, limit: 10, offset: 0 });

    expect(results).toHaveLength(1);
    expect(results[0].meetingTitle).toBe('Current');
  });
});
