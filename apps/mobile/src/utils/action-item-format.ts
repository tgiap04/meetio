/**
 * `MeetingActionItem.due_date` (`YYYY-MM-DD` or `null`) <-> the design's
 * display/edit format (`DD/MM` for display, `DD/MM/YYYY` for the edit field).
 * Kept in one file so the two directions never drift apart.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const EDIT_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** `DD/MM` for the action-item card meta line; `null` when there is no due date. */
export function formatDueDateDisplay(dueDate: string | null): string | null {
  const match = dueDate?.match(ISO_DATE);
  if (!match) {
    return null;
  }
  const [, , mm, dd] = match;
  return `${dd}/${mm}`;
}

/** `DD/MM/YYYY` seed value for the edit sheet's due-date field; `''` when unset. */
export function formatDueDateForInput(dueDate: string | null): string {
  const match = dueDate?.match(ISO_DATE);
  if (!match) {
    return '';
  }
  const [, yyyy, mm, dd] = match;
  return `${dd}/${mm}/${yyyy}`;
}

export interface ParsedDueDate {
  /** `null` means "clear the due date" (empty input) or "the text was invalid". */
  value: string | null;
  valid: boolean;
}

/**
 * Parses the edit field's `DD/MM/YYYY` text back to `YYYY-MM-DD`. Blank input
 * is a valid way to clear the due date (`value: null, valid: true`); anything
 * else that doesn't match the calendar is `valid: false` so the caller can
 * block the save rather than silently store a bad date.
 */
export function parseDueDateInput(text: string): ParsedDueDate {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { value: null, valid: true };
  }

  const match = trimmed.match(EDIT_DATE);
  if (!match) {
    return { value: null, valid: false };
  }

  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const date = new Date(Number(yyyy), month - 1, day);
  const isRealDate = date.getFullYear() === Number(yyyy) && date.getMonth() === month - 1 && date.getDate() === day;
  if (!isRealDate) {
    return { value: null, valid: false };
  }

  return { value: `${yyyy}-${mm}-${dd}`, valid: true };
}
