/**
 * "Cuộc họp 17/09 14:30" (US-07). The server does not know the device's time
 * zone, and the product is Vietnamese-first, so it formats in Asia/Ho_Chi_Minh;
 * a client that knows better sends its own `title`.
 */
const FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function defaultMeetingTitle(startedAt: Date): string {
  const parts = Object.fromEntries(FORMATTER.formatToParts(startedAt).map((p) => [p.type, p.value]));
  return `Cuộc họp ${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}
