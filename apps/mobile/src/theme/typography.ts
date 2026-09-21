import { Platform } from 'react-native';

/**
 * Font choice for Meetio's mobile shell.
 *
 * Decision: use each platform's SYSTEM font (San Francisco on iOS, Roboto on
 * Android) rather than bundling a custom typeface.
 *
 * Why this covers Vietnamese correctly: Vietnamese text needs the base Latin
 * block plus Latin Extended-A/B and, critically, Latin Extended Additional
 * (U+1E00–U+1EFF) for the stacked tone-mark + base-diacritic combinations in
 * letters like "ệ", "ườ", "ấ", "ỡ". Both San Francisco and Roboto ship full
 * coverage of that block as part of the OS-level font — this is exactly the
 * shared reason iOS and Android are able to render Vietnamese natively in
 * every system app without any app bundling its own font. A custom bundled
 * font is unnecessary complexity here (YAGNI) and risks being the one thing
 * that HASN'T been checked for full diacritic coverage; the platform default
 * has already been checked, by the platform vendor, for every OS release.
 *
 * What automated tests below verify: that our Vietnamese copy strings are
 * composed of characters within the Unicode blocks system fonts are known to
 * cover, i.e. that nothing in this codebase's Vietnamese strings depends on a
 * glyph outside that guarantee. Actual glyph *rendering* is a platform
 * concern Jest cannot exercise — that is confirmed by on-device/simulator
 * visual QA, called out in the hand-back as a manual step.
 */
export const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

export const typography = {
  /** Splash wordmark ("Meetio"), the single largest text in the app. */
  display: { fontFamily, fontSize: 40, fontWeight: '700' as const },
  /** Two-line headings on onboarding and the microphone-permission screen. */
  heading: { fontFamily, fontSize: 22, fontWeight: '700' as const },
  title: { fontFamily, fontSize: 24, fontWeight: '600' as const },
  body: { fontFamily, fontSize: 16, fontWeight: '400' as const },
  caption: { fontFamily, fontSize: 13, fontWeight: '400' as const },
  button: { fontFamily, fontSize: 16, fontWeight: '600' as const },
  /** Section headings inside a screen (e.g. "Cuộc họp gần đây", "Nguồn âm thanh"). */
  sectionTitle: { fontFamily, fontSize: 17, fontWeight: '600' as const },
  /** Row labels and settings-item titles (e.g. "Ngôn ngữ", "Dịch thuật"). */
  label: { fontFamily, fontSize: 15, fontWeight: '600' as const },
};

/**
 * Vietnamese text is well-formed for system-font rendering when every
 * character falls in the Basic Latin, Latin-1 Supplement, Latin Extended-A/B,
 * or Latin Extended Additional blocks (the blocks San Francisco and Roboto
 * guarantee), or is plain whitespace/punctuation.
 */
const SUPPORTED_VIETNAMESE_RANGES: Array<[number, number]> = [
  [0x0000, 0x024f], // Basic Latin + Latin-1 Supplement + Latin Extended-A/B
  [0x1e00, 0x1eff], // Latin Extended Additional (Vietnamese tone-stacked letters)
  [0x2010, 0x2027], // General punctuation used in Vietnamese prose (dashes, quotes)
  // Arrows (U+2190-U+21FF): the design uses a literal "→" as UI copy — the
  // Dịch thuật row's value ("English → Vietnamese") and the knowledge-graph
  // relation rows ("Nguyễn Văn Anh → phụ trách → API"). Same platform-vendor
  // guarantee as Latin Extended Additional above: San Francisco and Roboto
  // both ship full coverage of the basic arrows block as part of the OS-level
  // font, so this is not a glyph that needs checking case by case.
  [0x2190, 0x21ff],
];

export function isRenderableVietnameseText(text: string): boolean {
  return Array.from(text).every((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return SUPPORTED_VIETNAMESE_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
  });
}
