import type { EntityType } from '@meetio/shared';

/** Leading forms of address dropped from PERSON names: "anh Bình", "Chị Lan", "ông Tuấn". */
const HONORIFICS = new Set(['anh', 'chị', 'ông', 'bà', 'em', 'cô', 'chú', 'bác', 'cậu', 'dì', 'thầy', 'sếp']);

/**
 * Leading category words the model keeps or drops at will: "công ty Sao Mai" / "Sao Mai",
 * "ứng dụng Meetio" / "Meetio" (seen in the live check). Compared after diacritics are removed.
 */
const CATEGORY_WORDS: Record<string, string[]> = {
  organization: ['cong ty', 'cty', 'tap doan', 'ngan hang', 'to chuc', 'khach hang', 'ben', 'doanh nghiep'],
  project: ['du an'],
  product: ['ung dung', 'app', 'san pham', 'phan mem', 'nen tang', 'he thong'],
};

const stripDiacritics = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

/**
 * `normalized_name` — the cheapest resolution tier (phase-13 step 3): lowercase, no diacritics,
 * punctuation folded to spaces, for people the leading honorific removed ("Anh Bình", "anh bình",
 * "Bình" → "binh") and for organizations, projects and products the leading category word
 * ("công ty Sao Mai" → "sao mai"). The honorific is only dropped when a name follows it —
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
  let key = stripDiacritics(words.join(' '));
  for (const prefix of CATEGORY_WORDS[type] ?? []) {
    // Only when a name is left after it: "Dự án" on its own stays "du an".
    if (key.startsWith(`${prefix} `)) key = key.slice(prefix.length + 1);
  }
  return key;
}
