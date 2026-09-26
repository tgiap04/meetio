/**
 * Calibrates the entity-merge thresholds (OQ-03, phase-13 step 11) on a hand-labelled gold set,
 * with the real embedding model the resolve step uses. Needs GEMINI_API_KEY.
 *
 *   yarn workspace @meetio/api graph:eval path/to/gold.json
 *
 * gold.json — pairs of entity names taken from real meetings, labelled by a person:
 *   { "pairs": [ { "a": { "name": "anh Bình", "type": "person", "description": "PM" },
 *                  "b": { "name": "Bình", "type": "person" }, "same": true }, ... ] }
 *
 * For each candidate threshold it prints, over the pairs tier 1 (normalized name) does not
 * already join: how many pairs it would flag, precision, recall and the wrong-merge rate.
 * Phase-13 targets: precision > 85 %, wrong merges < 5 %. The gold file stays local; keys are
 * never printed.
 */
import { readFileSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { parseApiKeys } from '../src/ai/gemini-key-pool.js';
import { normalizeEntityName } from '../src/graph/name-normalizer.js';
import { entityEmbeddingText, type ExtractedEntity } from '../src/graph/entity-resolver.js';

interface Pair {
  a: ExtractedEntity;
  b: ExtractedEntity;
  same: boolean;
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
};
const pct = (n: number, d: number) => (d === 0 ? '   —  ' : `${((100 * n) / d).toFixed(1).padStart(5)}%`);

async function main(): Promise<void> {
  const file = process.argv[2];
  const [key] = parseApiKeys(process.env.GEMINI_API_KEY);
  if (!file || !key) throw new Error('usage: graph:eval <gold.json>  (GEMINI_API_KEY must be set)');
  const pairs = (JSON.parse(readFileSync(file, 'utf8')) as { pairs: Pair[] }).pairs.map((p) => ({
    ...p,
    a: { description: null, ...p.a },
    b: { description: null, ...p.b },
  }));

  const tier1 = pairs.filter((p) => p.a.type === p.b.type && normalizeEntityName(p.a.name, p.a.type) === normalizeEntityName(p.b.name, p.b.type));
  const wrongTier1 = tier1.filter((p) => !p.same).length;
  console.log(`tier 1 (normalized name) joins ${tier1.length} pairs, ${wrongTier1} of them wrongly`);

  const rest = pairs.filter((p) => !tier1.includes(p) && p.a.type === p.b.type);
  const models = new GoogleGenAI({ apiKey: key }).models;
  const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  const scored: { same: boolean; score: number }[] = [];
  for (let i = 0; i < rest.length; i += 50) {
    const batch = rest.slice(i, i + 50);
    const res = await models.embedContent({
      model,
      contents: batch.flatMap((p) => [entityEmbeddingText(p.a), entityEmbeddingText(p.b)]),
      config: { outputDimensionality: 768, taskType: 'SEMANTIC_SIMILARITY' },
    });
    const v = res.embeddings!.map((e) => e.values!);
    batch.forEach((p, j) => scored.push({ same: p.same, score: cosine(v[2 * j], v[2 * j + 1]) }));
  }

  const positives = scored.filter((s) => s.same).length;
  console.log(`\nvector tier over ${scored.length} same-type pairs (${positives} truly the same)`);
  console.log('threshold  flagged  precision  recall  wrong-merge');
  for (let t = 0.7; t <= 0.981; t += 0.02) {
    const flagged = scored.filter((s) => s.score >= t);
    const right = flagged.filter((s) => s.same).length;
    console.log(`   ${t.toFixed(2)}     ${String(flagged.length).padStart(4)}    ${pct(right, flagged.length)}   ${pct(right, positives)}   ${pct(flagged.length - right, flagged.length)}`);
  }
  console.log('\nSet ENTITY_SUGGEST_THRESHOLD to the lowest threshold that keeps precision acceptable for review,');
  console.log('and only set ENTITY_AUTO_MERGE_THRESHOLD where wrong-merge stays under 5 %.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
