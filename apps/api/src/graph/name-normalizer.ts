import type { EntityType } from '@meetio/shared';

/** Leading forms of address dropped from PERSON names: "anh Bình", "Chị Lan", "ông Tuấn". */
const HONORIFICS = new Set(['anh', 'chị', 'ông', 'bà', 'em', 'cô', 'chú', 'bác', 'cậu', 'dì', 'thầy', 'sếp']);

const stripDiacritics = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

/**
 * `normalized_name` — the cheapest resolution tier (phase-13 step 3): lowercase, no diacritics,
 * punctuation folded to spaces, and for people the leading honorific removed, so "Anh Bình",
 * "anh bình" and "Bình" all become "binh". The honorific is only dropped when a name follows it —
 * "Anh" on its own is a name.
 */
export function normalizeEntityName(name: string, type: EntityType | string): string {
  let words = name
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (type === 'person') {
    while (words.length > 1 && HONORIFICS.has(words[0])) words = words.slice(1);
  }
  return stripDiacritics(words.join(' '));
}
