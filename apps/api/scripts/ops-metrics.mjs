/**
 * Production numbers for the NFR table, read straight from the database (needs a built API: `yarn build`).
 *
 *   yarn workspace @meetio/api ops:metrics [days=7]
 *
 * - NFR-06: time from a meeting ending to the pipeline finishing (last step done), p50/p95.
 * - Per pipeline step: duration p50/p95 (processing_jobs.started_at → finished_at).
 * - NFR-05: question-answering latency p50/p95 (qa_messages.latency_ms).
 * - NFR-07: tokens by operation this calendar month.
 * Aggregates only — no content, no user ids.
 */
import { AppDataSource } from '../dist/database/data-source.js';

const days = Number(process.argv[2] ?? 7);
const fmt = (ms) => (ms === null || ms === undefined ? '—' : ms >= 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);

async function main() {
  await AppDataSource.initialize();
  try {
    const since = `now() - make_interval(days => ${days})`;
    const [pipeline] = await AppDataSource.query(
      `WITH runs AS (
         SELECT m.id, EXTRACT(EPOCH FROM (max(j.finished_at) - m.ended_at)) * 1000 AS ms
         FROM meetings m JOIN processing_jobs j ON j.meeting_id = m.id
         WHERE m.status = 'ready' AND m.ended_at >= ${since} GROUP BY m.id, m.ended_at)
       SELECT count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) AS p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95 FROM runs`,
    );
    console.log(`Last ${days} day(s)`);
    console.log(`NFR-06 end → ready: n=${pipeline.n} p50=${fmt(pipeline.p50)} p95=${fmt(pipeline.p95)} (target < 5 min for a 60-min meeting)`);

    const steps = await AppDataSource.query(
      `SELECT step, count(*)::int AS n,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000) AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000) AS p95
       FROM processing_jobs WHERE status = 'succeeded' AND finished_at >= ${since} AND started_at IS NOT NULL
       GROUP BY step ORDER BY array_position(ARRAY['chunk','embed','extract','resolve','summarize']::text[], step::text)`,
    );
    for (const s of steps) console.log(`  step ${s.step.padEnd(9)} n=${s.n} p50=${fmt(s.p50)} p95=${fmt(s.p95)}`);

    const [qa] = await AppDataSource.query(
      `SELECT count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
       FROM qa_messages WHERE role = 'assistant' AND latency_ms IS NOT NULL AND created_at >= ${since}`,
    );
    console.log(`NFR-05 Q&A answer: n=${qa.n} p50=${fmt(qa.p50)} p95=${fmt(qa.p95)} (target < 5s)`);

    const tokens = await AppDataSource.query(
      `SELECT operation, count(*)::int AS calls, sum(input_tokens)::bigint AS input, sum(output_tokens)::bigint AS output
       FROM usage_records WHERE created_at >= date_trunc('month', now()) GROUP BY operation ORDER BY operation`,
    );
    console.log('NFR-07 tokens this month:');
    for (const t of tokens) console.log(`  ${t.operation.padEnd(10)} ${t.calls} call(s), ${t.input} in / ${t.output} out`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
