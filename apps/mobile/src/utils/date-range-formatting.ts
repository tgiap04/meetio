/** `DD/MM` from an ISO date, for the Library date-filter chip. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/**
 * The active date-range filter's chip label (US-21), or `null` when no date
 * filter is applied — the caller renders nothing in that case.
 */
export function formatDateRangeLabel(from: string | null, to: string | null): string | null {
  if (!from && !to) {
    return null;
  }
  if (from && to) {
    return `Từ ${shortDate(from)} – ${shortDate(to)}`;
  }
  if (from) {
    return `Từ ${shortDate(from)}`;
  }
  return `Đến ${shortDate(to as string)}`;
}
