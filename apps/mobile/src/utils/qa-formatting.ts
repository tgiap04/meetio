/**
 * Formatting helpers specific to the Q&A screens (US-35→39): a citation
 * chip's compact date, and the global chat's own `DD/MM/YYYY` date-range
 * filter parse. Kept separate from `action-item-format.ts` even though the
 * edit-field format is the same shape — that file's parse is due-date
 * domain, this one is a Q&A filter, and the two have no reason to share a
 * call site.
 */

/** `dd/MM` for a citation chip (US-36) — the chip is compact by design, so no
 *  year; `meeting_date` is nullable per the contract (a meeting that never
 *  recorded a start), rendered as an em dash. */
export function formatCitationDate(iso: string | null): string {
  if (iso === null) {
    return '—';
  }
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mo}`;
}

const EDIT_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** `DD/MM/YYYY` → `YYYY-MM-DD` for the global Q&A date-range filter (US-37).
 *  Blank or unparsable text both resolve to `null` — clears that bound
 *  rather than blocking the question. */
export function parseQaDateInput(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const match = trimmed.match(EDIT_DATE);
  if (!match) {
    return null;
  }
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const date = new Date(year, month - 1, day);
  const isRealDate = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isRealDate ? `${yyyy}-${mm}-${dd}` : null;
}
