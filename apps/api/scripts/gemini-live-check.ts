/**
 * Live check against real Gemini (needs GEMINI_API_KEY; several keys = comma-separated).
 * Answers what tests with a fake model cannot:
 *   1. Does the embedding model accept countTokens? (clarifications 2026-09-26:
 *      if not, stop and decide — never record guessed token counts.)
 *   2. Does every configured key work?
 *   3. Does meaning-based search find the right passage when the query shares
 *      almost no words with it? (phase-12 acceptance: "bàn về ngân sách quý sau")
 *
 *   yarn workspace @meetio/api gemini:check
 *
 * Uses only synthetic Vietnamese meeting text — no real meeting content leaves the machine.
 * Keys are never printed; only their position.
 */
import { GoogleGenAI } from '@google/genai';
import { parseApiKeys } from '../src/ai/gemini-key-pool.js';

const EMBED_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const PASSAGES = [
  'Chi phí cho quý tới cần tăng khoảng mười phần trăm vì chiến dịch quảng cáo mới.',
  'Nhóm thiết kế sẽ nghỉ lễ ba ngày, lịch bàn giao giao diện lùi sang thứ Hai.',
  'Máy chủ cơ sở dữ liệu quá tải vào giờ cao điểm, cần thêm hai máy và bật bộ đệm.',
  'Anh Bình nhận phần tích hợp cổng thanh toán, hạn chót là cuối tuần sau.',
  'Khách hàng phàn nàn ứng dụng chậm khi mở danh sách cuộc họp dài.',
];
// Each query paraphrases one passage with different wording.
const GOLDEN: [string, number][] = [
  ['bàn về ngân sách quý sau', 0],
  ['ai phụ trách thanh toán và khi nào xong', 3],
  ['hệ thống bị nghẽn lúc đông người dùng', 2],
  ['lịch giao bản vẽ bị trễ vì đội nghỉ', 1],
  ['người dùng than app load chậm', 4],
];

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
};

async function main(): Promise<void> {
  const keys = parseApiKeys(process.env.GEMINI_API_KEY);
  if (keys.length === 0) {
    console.error('GEMINI_API_KEY is empty — set one or more keys (comma-separated) in the repo-root .env');
    process.exit(2);
  }
  const clients = keys.map((apiKey) => new GoogleGenAI({ apiKey }).models);

  console.log(`1) Keys: ${keys.length}`);
  for (let i = 0; i < clients.length; i++) {
    try {
      const r = await clients[i].countTokens({ model: EMBED_MODEL, contents: PASSAGES[0] });
      console.log(`   key #${i + 1}: OK — countTokens on ${EMBED_MODEL} = ${r.totalTokens}`);
    } catch (e) {
      console.log(`   key #${i + 1}: FAILED — HTTP ${(e as { status?: number }).status ?? '?'} ${(e as Error).message.slice(0, 160)}`);
    }
  }

  const models = clients[0];
  const embed = async (texts: string[], taskType: string) =>
    (await models.embedContent({ model: EMBED_MODEL, contents: texts, config: { outputDimensionality: 768, taskType } })).embeddings!.map((e) => e.values!);
  const docs = await embed(PASSAGES, 'RETRIEVAL_DOCUMENT');
  console.log(`2) Embedding: ${docs.length} vectors × ${docs[0].length} dims`);

  let hits = 0;
  const queries = await embed(GOLDEN.map(([q]) => q), 'RETRIEVAL_QUERY');
  GOLDEN.forEach(([q, expected], i) => {
    const ranked = docs.map((d, j) => [j, cosine(queries[i], d)] as const).sort((a, b) => b[1] - a[1]);
    const ok = ranked[0][0] === expected;
    hits += ok ? 1 : 0;
    console.log(`   ${ok ? '✓' : '✗'} "${q}" → #${ranked[0][0]} (sim ${ranked[0][1].toFixed(3)}; expected #${expected})`);
  });
  console.log(`3) Golden queries: ${hits}/${GOLDEN.length} top-1`);
  process.exitCode = hits === GOLDEN.length ? 0 : 1;
}

main().catch((e) => {
  console.error(`FAILED: HTTP ${(e as { status?: number }).status ?? '?'} ${(e as Error).message.slice(0, 300)}`);
  process.exit(1);
});
