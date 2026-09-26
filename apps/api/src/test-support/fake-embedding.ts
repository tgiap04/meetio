import { createHash } from 'node:crypto';

/**
 * Deterministic word-hashing embedding for tests (no Gemini key in CI): texts
 * sharing words land close together. Proves plumbing and ranking mechanics —
 * not semantic quality, which only a real model can show.
 */
export function fakeEmbedding(text: string, dims = 768): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const word of text.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const h = createHash('sha256').update(word).digest();
    v[h.readUInt32BE(0) % dims] += 1;
  }
  return v;
}
