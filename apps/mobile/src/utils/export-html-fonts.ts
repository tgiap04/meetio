/**
 * A font stack that renders Vietnamese diacritics correctly under
 * expo-print's PDF renderer (Noto Sans covers the full Vietnamese Unicode
 * range on both iOS and Android; the rest are safe system fallbacks).
 */
const VIETNAMESE_SAFE_FONT_STACK = '"Noto Sans", "Helvetica Neue", Arial, sans-serif';

/**
 * Ensures the HTML handed to `expo-print` declares UTF-8 and the Vietnamese-
 * safe font stack, regardless of whether the server's `/export?format=html`
 * body is a full document or a bare fragment.
 */
export function ensureVietnameseFontStack(html: string): string {
  const styleTag = `<style>body, * { font-family: ${VIETNAMESE_SAFE_FONT_STACK}; }</style>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}<meta charset="UTF-8" />${styleTag}`);
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8" />${styleTag}</head><body>${html}</body></html>`;
}
