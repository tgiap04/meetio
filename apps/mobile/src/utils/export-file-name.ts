/** A filesystem-safe base name (no extension) derived from a meeting title. */
export function sanitizeExportFileName(title: string): string {
  const cleaned = title
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return cleaned || 'cuoc-hop';
}
