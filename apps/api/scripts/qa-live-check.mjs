/**
 * Live check of Phase 15 against real Gemini (needs GEMINI_API_KEY and a built API: `yarn build`).
 * Answers what tests with a fake model cannot:
 *   1. What best-chunk similarity do answerable vs unanswerable questions get? → calibrates
 *      QA_MIN_SIMILARITY (the "don't even ask the model" gate).
 *   2. Is a question about a 2-hour meeting answered in under 5 s at p95 (phase-15 NFR)?
 *   3. Do cross-meeting answers cite more than one meeting, and are out-of-scope questions "not found"?
 *
 *   yarn workspace @meetio/api qa:check
 *
 * Runs the real pipeline (chunk → embed → extract → resolve) on two synthetic Vietnamese meetings in a
 * throwaway user, asks questions through the real QaService, then deletes that user. Keys never printed.
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
import { Retriever } from '../dist/qa/retriever.js';
import { QaService } from '../dist/qa/qa.service.js';

const MEETING_A = [
  'Chào mọi người, hôm nay họp tiến độ Dự án ABC, anh Bình chủ trì.',
  'Anh Bình: nhóm backend đã xong tích hợp cổng thanh toán với ngân hàng Vietcombank.',
  'Chị Lan: bên thiết kế cần thêm hai ngày để hoàn thiện giao diện ứng dụng Meetio.',
  'Hạn chót bàn giao cho khách hàng công ty Sao Mai là ngày 30 tháng 10.',
  'Tuấn phụ trách kiểm thử, còn mười hai lỗi mức cao trên bản Android.',
  'Chị Mai hỏi ngân sách quý bốn cho Dự án ABC, dự kiến tăng mười phần trăm.',
  'Nhóm sẽ chuyển máy chủ sang Google Cloud để giảm độ trễ.',
  'Chị Mai lo chi phí Google Cloud vượt ngân sách nếu không bật chế độ tiết kiệm.',
  'Khách hàng Sao Mai muốn ứng dụng Meetio xuất biên bản sang PDF.',
  'Mọi người thống nhất họp lại thứ Tư tuần sau để rà soát rủi ro.',
];
const MEETING_B = [
  'Họp tuyển dụng: công ty cần thêm hai kỹ sư Android cho Dự án ABC.',
  'Chị Lan đề xuất thưởng giới thiệu năm triệu đồng cho mỗi ứng viên được nhận.',
  'Anh Bình muốn phỏng vấn xong trước ngày 15 tháng 11.',
  'Ngân sách tuyển dụng quý bốn là hai trăm triệu đồng.',
];
const ANSWERABLE = [
  ['Ai phụ trách kiểm thử và còn bao nhiêu lỗi?', 'A'],
  ['Hạn chót bàn giao cho Sao Mai là khi nào?', 'A'],
  ['Vì sao lại chuyển máy chủ?', 'A'],
  ['Khách hàng muốn thêm tính năng gì?', 'A'],
  ['Ngân sách quý bốn của dự án ABC thay đổi thế nào?', 'both'],
  ['Dự án ABC đang cần những gì?', 'both'],
];
const UNANSWERABLE = ['Thời tiết Hà Nội cuối tuần này thế nào?', 'Giá vàng hôm nay bao nhiêu?', 'Công thức nấu phở bò là gì?', 'Ai thắng World Cup 2022?'];
const FOLLOW_UP = ['Chị Mai lo ngại điều gì?', 'Còn anh Bình thì sao?'];

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)];

async function record(ctx0, userId, title, lines, minutes) {
  const [{ id }] = await AppDataSource.query(
    `INSERT INTO meetings (user_id, title, status, source_language, started_at) VALUES ($1, $2, 'processing', 'vi-VN', now()) RETURNING id`,
    [userId, title],
  );
  const count = minutes * 10;
  for (let seq = 1; seq <= count; seq++) {
    await AppDataSource.query(`INSERT INTO transcript_segments (meeting_id, seq, text, started_at_ms, ended_at_ms) VALUES ($1, $2, $3, $4, $5)`, [
      id, seq, lines[(seq - 1) % lines.length], (seq - 1) * 6000, seq * 6000 - 300,
    ]);
  }
  const ctx = { ...ctx0, meetingId: id };
  for (const step of ctx0.steps) await step.run(ctx);
  await AppDataSource.query(`UPDATE meetings SET status = 'ready' WHERE id = $1`, [id]);
  return id;
}

async function main() {
  const keys = parseApiKeys(process.env.GEMINI_API_KEY);
  if (keys.length === 0) throw new Error('GEMINI_API_KEY is empty');
  await AppDataSource.initialize();
  await registerPgVectorTypes(AppDataSource);
  const runner = new GeminiCallRunner(new GeminiKeyPool(keys.map((apiKey) => new GoogleGenAI({ apiKey }).models), { defaultCooldownMs: 60_000 }), {
    maxConcurrency: num(process.env.GEMINI_MAX_CONCURRENCY, 4), retries: num(process.env.GEMINI_MAX_RETRIES, 5), retryBaseMs: 1000, log: () => undefined,
  });
  const gemini = new GeminiClient(runner, new UsageTracker(AppDataSource), {
    textModel: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash', embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001', dimensions: 768,
  });
  const userId = randomUUID();
  try {
    await AppDataSource.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'QA live check', 'x')`, [userId, `qa-live-${userId}@meetio.test`]);
    const steps = [new ChunkStepHandler(AppDataSource), new EmbedStepHandler(AppDataSource, gemini), new ExtractStepHandler(AppDataSource, gemini),
      new ResolveStepHandler(AppDataSource, gemini, new EntityResolver(DEFAULT_RESOLVER_OPTIONS))];
    const base = { userId, run: 1, scope: 'full', changedSince: null, signal: new AbortController().signal, steps };
    const t0 = Date.now();
    const a = await record(base, userId, 'Họp tiến độ ABC', MEETING_A, 120);
    const b = await record(base, userId, 'Họp tuyển dụng', MEETING_B, 20);
    console.log(`1) Meetings ready: 120-min "Họp tiến độ ABC" + 20-min "Họp tuyển dụng" in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

    const retriever = new Retriever(AppDataSource, gemini);
    const scope = { userId, meetingId: null, from: null, to: null, entityId: null };
    const sims = async (q) => (await retriever.retrieve(scope, q, new AbortController().signal)).bestSimilarity;
    const inSims = [];
    for (const [q] of ANSWERABLE) inSims.push(await sims(q));
    const outSims = [];
    for (const q of UNANSWERABLE) outSims.push(await sims(q));
    console.log(`2) Best-chunk similarity — answerable: ${inSims.map((s) => s.toFixed(3)).join(', ')}`);
    console.log(`   unanswerable: ${outSims.map((s) => s.toFixed(3)).join(', ')}  (gate QA_MIN_SIMILARITY=${process.env.QA_MIN_SIMILARITY || '0.6 default'})`);

    const qa = new QaService(AppDataSource, gemini, { get: (k) => process.env[k] });
    const times = [];
    console.log('3) Answers:');
    for (const [q, where] of ANSWERABLE) {
      const t = Date.now();
      const { answer } = where === 'A' ? await qa.askMeeting(userId, a, q) : await qa.askGlobal(userId, q);
      times.push(Date.now() - t);
      const meetings = [...new Set(answer.citations.map((c) => c.meeting_title))];
      console.log(`   [${where === 'A' ? 'meeting' : 'global'} ${times.at(-1)}ms] ${q}\n      → ${answer.not_found ? 'NOT FOUND' : answer.content} | conf ${answer.confidence} | cites ${answer.citations.length} from ${meetings.join(' + ') || '—'}`);
    }
    for (const q of UNANSWERABLE) {
      const t = Date.now();
      const { answer } = await qa.askGlobal(userId, q);
      times.push(Date.now() - t);
      console.log(`   [global ${times.at(-1)}ms] ${q} → ${answer.not_found ? 'NOT FOUND ✓' : `ANSWERED ✗: ${answer.content}`}`);
    }
    for (const q of FOLLOW_UP) {
      const t = Date.now();
      const { answer } = await qa.askMeeting(userId, a, q);
      times.push(Date.now() - t);
      console.log(`   [follow-up ${times.at(-1)}ms] ${q} → ${answer.not_found ? 'NOT FOUND' : answer.content}`);
    }
    console.log(`4) Latency: p95 ${p95(times)}ms, max ${Math.max(...times)}ms over ${times.length} questions — NFR < 5000ms: ${p95(times) < 5000 ? 'PASS' : 'FAIL'}`);
    void b;
  } finally {
    await AppDataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
