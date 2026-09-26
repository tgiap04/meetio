/**
 * Live check of Phase 13 against real Gemini (needs GEMINI_API_KEY and a built API: `yarn build`).
 * Answers what tests with a fake model cannot:
 *   1. Does the text model honour the extraction responseSchema (answers that pass validation)?
 *   2. Does a ~60-minute meeting go through extract + resolve in under 2 minutes (phase-13 NFR)?
 *   3. Do the extracted entities make sense, and do name variants ("anh Bình" / "Bình") land on one entity?
 *   4. Phase 14: is the 60-minute meeting summarized in under 60 seconds, with cited points, and are tasks
 *      assigned only to people the transcript names (first look at OQ-02 — not a substitute for the gold set)?
 *
 *   yarn workspace @meetio/api graph:check
 *
 * Runs the real pipeline handlers (chunk → embed → extract → resolve) on a synthetic Vietnamese
 * meeting in a throwaway user, then deletes that user. No real meeting content leaves the machine;
 * keys are never printed.
 */
import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { AppDataSource, registerPgVectorTypes } from '../dist/database/data-source.js';
import { parseApiKeys, GeminiKeyPool } from '../dist/ai/gemini-key-pool.js';
import { GeminiCallRunner } from '../dist/ai/gemini-call-runner.js';
import { GeminiClient } from '../dist/ai/gemini.client.js';
import { UsageTracker } from '../dist/ai/usage-tracker.js';
import { ChunkStepHandler } from '../dist/chunking/chunk-step.handler.js';
import { EmbedStepHandler } from '../dist/chunking/embed-step.handler.js';
import { ExtractStepHandler } from '../dist/graph/extract-step.handler.js';
import { ResolveStepHandler } from '../dist/graph/resolve-step.handler.js';
import { EntityResolver, DEFAULT_RESOLVER_OPTIONS } from '../dist/graph/entity-resolver.js';
import { SummarizeStepHandler } from '../dist/summaries/summarize-step.handler.js';

const LINES = [
  'Chào mọi người, hôm nay mình họp về tiến độ Dự án ABC, anh Bình chủ trì nhé.',
  'Anh Bình: tuần này nhóm backend đã xong phần tích hợp cổng thanh toán với ngân hàng Vietcombank.',
  'Chị Lan cho biết bên thiết kế cần thêm hai ngày để hoàn thiện giao diện ứng dụng Meetio.',
  'Bình nhắc lại hạn chót bàn giao cho khách hàng công ty Sao Mai là cuối tháng này.',
  'Tuấn phụ trách kiểm thử, hiện còn mười hai lỗi mức cao trên bản Android.',
  'Chị Mai bên kế toán hỏi về ngân sách quý bốn cho Dự án ABC, dự kiến tăng mười phần trăm.',
  'Anh Bình đề nghị Tuấn ưu tiên sửa lỗi đăng nhập trước khi làm tính năng mới.',
  'Lan nói giao diện màn hình thư viện cuộc họp đã được công ty Sao Mai duyệt.',
  'Về hạ tầng, nhóm sẽ chuyển máy chủ sang Google Cloud để giảm độ trễ.',
  'Chị Mai lo ngại chi phí Google Cloud vượt ngân sách nếu không bật chế độ tiết kiệm.',
  'Anh Bình chốt: Tuấn gửi báo cáo lỗi vào thứ Sáu, chị Lan gửi bản thiết kế cuối vào thứ Hai.',
  'Dự án Thanh Toán Nhanh là giai đoạn hai của Dự án ABC, do chị Lan làm trưởng nhóm sản phẩm.',
  'Khách hàng Sao Mai muốn ứng dụng Meetio hỗ trợ xuất biên bản sang PDF.',
  'Tuấn đề xuất dùng thêm công cụ kiểm thử tự động để rút ngắn vòng phát hành.',
  'Bình đồng ý và giao cho Tuấn đánh giá công cụ trong tuần tới.',
  'Mọi người thống nhất họp lại vào thứ Tư tuần sau để rà soát rủi ro.',
];
const MINUTES = 60;
const SECONDS_PER_SEGMENT = 6; // ~10 segments a minute, ~20 words each ≈ 200 words/minute of speech
// Expected entities — each should come out once, whatever form the transcript uses.
const EXPECTED = [
  ['person', 'Bình'], ['person', 'Lan'], ['person', 'Tuấn'], ['person', 'Mai'],
  ['project', 'ABC'], ['project', 'Thanh Toán Nhanh'], ['organization', 'Sao Mai'], ['organization', 'Vietcombank'], ['product', 'Meetio'],
];

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

async function main() {
  const keys = parseApiKeys(process.env.GEMINI_API_KEY);
  if (keys.length === 0) throw new Error('GEMINI_API_KEY is empty — set one or more keys (comma-separated) in the repo-root .env');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  await AppDataSource.initialize();
  await registerPgVectorTypes(AppDataSource);
  const warnings = [];
  const runner = new GeminiCallRunner(new GeminiKeyPool(keys.map((apiKey) => new GoogleGenAI({ apiKey }).models), { defaultCooldownMs: num(process.env.GEMINI_KEY_COOLDOWN_MS, 60_000) }), {
    maxConcurrency: num(process.env.GEMINI_MAX_CONCURRENCY, 4),
    retries: num(process.env.GEMINI_MAX_RETRIES, 5),
    retryBaseMs: 1000,
    log: (m) => warnings.push(m),
  });
  const gemini = new GeminiClient(runner, new UsageTracker(AppDataSource), {
    textModel: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    dimensions: 768,
  });

  const userId = randomUUID();
  try {
    await AppDataSource.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'Graph live check', 'x')`, [userId, `graph-live-${userId}@meetio.test`]);
    const [{ id: meetingId }] = await AppDataSource.query(
      `INSERT INTO meetings (user_id, title, status, source_language, started_at) VALUES ($1, 'Graph live check', 'processing', 'vi-VN', now()) RETURNING id`,
      [userId],
    );
    const count = (MINUTES * 60) / SECONDS_PER_SEGMENT;
    for (let seq = 1; seq <= count; seq++) {
      const start = (seq - 1) * SECONDS_PER_SEGMENT * 1000;
      await AppDataSource.query(`INSERT INTO transcript_segments (meeting_id, seq, text, started_at_ms, ended_at_ms) VALUES ($1, $2, $3, $4, $5)`, [
        meetingId, seq, LINES[(seq - 1) % LINES.length], start, start + SECONDS_PER_SEGMENT * 1000 - 300,
      ]);
    }
    const ctx = { meetingId, userId, run: 1, scope: 'full', changedSince: null, signal: new AbortController().signal };

    console.log(`1) Meeting: ${MINUTES} min, ${count} segments, ${keys.length} key(s), model ${process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash'}`);
    const t0 = Date.now();
    await new ChunkStepHandler(AppDataSource).run(ctx);
    await new EmbedStepHandler(AppDataSource, gemini).run(ctx);
    const t1 = Date.now();
    await new ExtractStepHandler(AppDataSource, gemini).run(ctx);
    const t2 = Date.now();
    await new ResolveStepHandler(AppDataSource, gemini, new EntityResolver(DEFAULT_RESOLVER_OPTIONS)).run(ctx);
    const t3 = Date.now();
    await new SummarizeStepHandler(AppDataSource, gemini).run(ctx);
    const t4 = Date.now();

    const [chunks] = await AppDataSource.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE extraction IS NULL)::int AS skipped FROM meeting_chunks WHERE meeting_id = $1`,
      [meetingId],
    );
    console.log(`   chunk+embed ${seconds(t1 - t0)} · extract ${seconds(t2 - t1)} · resolve ${seconds(t3 - t2)}`);
    const graphMs = t3 - t1;
    console.log(`   extract+resolve ${seconds(graphMs)} for ${chunks.n} chunks — NFR < 120s: ${graphMs < 120_000 ? 'PASS' : 'FAIL'}`);
    console.log(`2) Schema: ${chunks.n - chunks.skipped}/${chunks.n} chunks passed validation${chunks.skipped ? ` — ${chunks.skipped} SKIPPED` : ''}`);

    const entities = await AppDataSource.query(
      `SELECT e.canonical_name, e.type, e.aliases, count(m.id)::int AS mentions FROM entities e LEFT JOIN entity_mentions m ON m.entity_id = e.id
       WHERE e.user_id = $1 AND e.merged_into_id IS NULL GROUP BY e.id ORDER BY e.type, mentions DESC`,
      [userId],
    );
    console.log(`3) Entities (${entities.length}):`);
    for (const e of entities) console.log(`   [${e.type}] ${e.canonical_name} — ${e.mentions} mention(s)`);
    for (const [type, needle] of EXPECTED) {
      const hits = entities.filter((e) => e.type === type && e.canonical_name.toLowerCase().includes(needle.toLowerCase()));
      console.log(`   ${hits.length === 1 ? '✓' : hits.length === 0 ? '✗ missing' : `✗ ${hits.length} copies`} ${type} "${needle}"${hits.length > 1 ? `: ${hits.map((h) => h.canonical_name).join(' | ')}` : ''}`);
    }
    const relations = await AppDataSource.query(
      `SELECT s.canonical_name AS s, r.relationship, t.canonical_name AS t, count(*)::int AS n FROM relations r
       JOIN entities s ON s.id = r.source_entity_id JOIN entities t ON t.id = r.target_entity_id
       WHERE r.user_id = $1 GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 12`,
      [userId],
    );
    console.log(`4) Top relations:`);
    for (const r of relations) console.log(`   ${r.s} → ${r.relationship} → ${r.t} (×${r.n})`);
    const suggestions = await AppDataSource.query(
      `SELECT a.canonical_name AS a, b.canonical_name AS b, s.score FROM entity_merge_suggestions s
       JOIN entities a ON a.id = s.entity_a_id JOIN entities b ON b.id = s.entity_b_id WHERE s.user_id = $1 ORDER BY s.score DESC`,
      [userId],
    );
    console.log(`5) Merge suggestions (threshold ${DEFAULT_RESOLVER_OPTIONS.suggestThreshold}): ${suggestions.length}`);
    for (const s of suggestions) console.log(`   ${s.a} ↔ ${s.b} (${Number(s.score).toFixed(3)})`);
    const [summary] = await AppDataSource.query('SELECT summary_insufficient, summary_citations FROM meetings WHERE id = $1', [meetingId]);
    console.log(`7) Summary: ${seconds(t4 - t3)} — NFR < 60s: ${t4 - t3 < 60_000 ? 'PASS' : 'FAIL'}; insufficient=${summary.summary_insufficient}`);
    for (const c of summary.summary_citations) console.log(`   [${c.kind}] ${c.text} (${c.chunk_ids.length} chunk(s), seq ${c.segment_seq})`);
    const actions = await AppDataSource.query(
      `SELECT a.content, e.canonical_name AS assignee, a.due_date::text AS due FROM action_items a LEFT JOIN entities e ON e.id = a.assignee_entity_id WHERE a.meeting_id = $1 ORDER BY a.created_at`,
      [meetingId],
    );
    console.log(`8) Action items (${actions.length}) — expected owners from the script: Tuấn (báo cáo lỗi, thứ Sáu), chị Lan (thiết kế cuối, thứ Hai), Tuấn (đánh giá công cụ):`);
    for (const a of actions) console.log(`   ${a.content} — ${a.assignee ?? '(trống)'} — ${a.due ?? '(không hạn)'}`);
    const usage = await AppDataSource.query(
      `SELECT operation, count(*)::int AS calls, sum(input_tokens)::int AS input, sum(output_tokens)::int AS output FROM usage_records WHERE user_id = $1 GROUP BY 1 ORDER BY 1`,
      [userId],
    );
    console.log('6) Usage:');
    for (const u of usage) console.log(`   ${u.operation}: ${u.calls} call(s), ${u.input} in / ${u.output} out tokens`);
    if (warnings.length) console.log(`   runner warnings: ${warnings.length} (e.g. ${warnings[0]})`);
  } finally {
    await AppDataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.message}${error.cause ? ` — cause: ${String(error.cause).slice(0, 300)}` : ''}` : error);
  process.exit(1);
});
