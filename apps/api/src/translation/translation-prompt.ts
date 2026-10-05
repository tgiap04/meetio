import type { BatchItem } from './translation-batcher.js';

const LANGUAGE_NAMES: Record<string, string> = { 'vi-VN': 'Vietnamese', 'en-US': 'English' };
const nameOf = (tag: string) => LANGUAGE_NAMES[tag] ?? tag;

/** Structured output: one `{seq, text}` per input segment, so the answer can be matched back by seq. */
export const TRANSLATION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { seq: { type: 'INTEGER' }, text: { type: 'STRING' } },
    required: ['seq', 'text'],
  },
};

export function buildTranslationRequest(items: readonly BatchItem[], source: string, target: string) {
  return {
    systemInstruction:
      `You translate meeting transcript segments from ${nameOf(source)} to ${nameOf(target)}. ` +
      'The input is a JSON array of {seq, text}. Return a JSON array with exactly one {seq, text} per input item, ' +
      'copying each seq unchanged and putting the translation in text. Keep meaning, tone, names, numbers and ' +
      'punctuation; do not merge, split, drop, reorder or comment on segments. If a segment is already in the target ' +
      'language, return it unchanged.',
    prompt: JSON.stringify(items.map(({ seq, text }) => ({ seq, text }))),
    responseSchema: TRANSLATION_RESPONSE_SCHEMA,
  };
}

/**
 * The usable part of a model answer: seq → translation, for seqs that were asked
 * for, appear once, and carry non-blank text. Anything else (bad JSON, wrong
 * shape, a stray seq) is simply absent, and the caller retries those segments alone.
 */
export function parseTranslations(raw: string, asked: readonly BatchItem[]): Map<number, string> {
  const result = new Map<number, string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return result;
  }
  if (!Array.isArray(parsed)) return result;
  const wanted = new Set(asked.map((i) => i.seq));
  for (const entry of parsed as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { seq, text } = entry as { seq?: unknown; text?: unknown };
    if (typeof seq !== 'number' || typeof text !== 'string') continue;
    if (!wanted.has(seq) || result.has(seq) || text.trim() === '') continue;
    result.set(seq, text.trim());
  }
  return result;
}
