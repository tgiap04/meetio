/**
 * phase-12 step 7 — semantic search latency on a realistic library size.
 * Seeds one user with N chunks (default 7,500 ≈ 500 meetings; also try 50,000),
 * plus the same amount for another user in the same table, then times
 * VectorRepository.searchChunks and prints the plan. Cleans up afterwards.
 *
 *   yarn workspace @meetio/api perf:search [--chunks 7500] [--runs 20]
 *
 * Seeding is slow on purpose-free grounds: every insert also goes into the
 * HNSW index (used by other lookups), which is why this is a script and not
 * part of `yarn test`.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import 'reflect-metadata';
import pgvector from 'pgvector/pg';
import { AppDataSource, registerPgVectorTypes } from '../src/database/data-source.js';
import { VectorRepository } from '../src/database/vector.repository.js';

const { values } = parseArgs({ options: { chunks: { type: 'string', default: '7500' }, runs: { type: 'string', default: '20' } } });
const CHUNKS = Number(values.chunks);
const RUNS = Number(values.runs);
const PER_MEETING = 15;

const unit = () => {
  const v = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

async function seed(owner: string): Promise<void> {
  const meetings = Math.ceil(CHUNKS / PER_MEETING);
  for (let done = 0; done < meetings; done += 100) {
    const batch = Math.min(100, meetings - done);
    await AppDataSource.query(
      `WITH ms AS (
         INSERT INTO meetings (user_id, title, status, source_language, started_at)
         SELECT $1, 'Perf ' || g, 'ready', 'vi-VN', now() - (g || ' hours')::interval FROM generate_series(1, $2) g RETURNING id
       )
       INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, token_count, content_hash, embedding)
       SELECT ms.id, $1, 'perf chunk', c, c, 10, gen_random_uuid()::text,
              (SELECT ('[' || string_agg(round((random() * 2 - 1)::numeric, 4)::text, ',') || ']')::vector FROM generate_series(1, 768) WHERE c > 0)
       FROM ms, generate_series(1, $3) AS c`,
      [owner, batch, PER_MEETING],
    );
    process.stdout.write(`\rseeded ${Math.min((done + batch) * PER_MEETING, CHUNKS)} chunks for ${owner.slice(0, 8)}…`);
  }
  process.stdout.write('\n');
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  await registerPgVectorTypes(AppDataSource);
  const users = [randomUUID(), randomUUID()];
  try {
    for (const id of users) {
      await AppDataSource.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'Perf', 'x')`, [id, `perf-${id}@meetio.test`]);
      await seed(id);
    }
    await AppDataSource.query('ANALYZE meeting_chunks');
    const repo = new VectorRepository(AppDataSource);
    const [u] = users;
    const plan = (
      await AppDataSource.query(
        `EXPLAIN ANALYZE SELECT c.id FROM meeting_chunks c JOIN meetings m ON m.id = c.meeting_id
         WHERE c.user_id = $2 AND c.embedding IS NOT NULL AND m.deleted_at IS NULL
         ORDER BY (c.embedding <=> $1) + 0, c.id LIMIT 11`,
        [pgvector.toSql(unit()), u],
      )
    )
      .map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN'])
      .join('\n');
    await repo.searchChunks(u, unit(), { limit: 11, offset: 0 });
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const started = performance.now();
      await repo.searchChunks(u, unit(), { limit: 11, offset: 0 });
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    const pick = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))].toFixed(1);
    console.log(plan);
    console.log(JSON.stringify({ chunks_for_user: CHUNKS, other_user_chunks: CHUNKS, runs: RUNS, ms: { p50: pick(0.5), p95: pick(0.95), max: pick(1) } }, null, 2));
    const p95 = Number(pick(0.95));
    console.log(p95 < 2000 && !plan.includes('idx_chunks_embedding') ? 'PASS: exact per-user search, p95 < 2s' : 'FAIL');
    if (p95 >= 2000) process.exitCode = 1;
  } finally {
    await AppDataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
