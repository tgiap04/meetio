import type { MeetingListItem } from '@meetio/shared';

/** `HH:mm dd/MM/yyyy` from an ISO timestamp, in the device's local time zone. */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${hh}:${mm} ${dd}/${mo}/${yyyy}`;
}

function formatDurationMinutes(durationSec: number | null): string {
  if (durationSec === null) {
    return '—';
  }
  const minutes = Math.max(1, Math.round(durationSec / 60));
  return `${minutes} phút`;
}

/** The "date/time · duration" meta line a Library/home row shows under the title. */
export function formatMeetingMeta(meeting: MeetingListItem): string {
  const timestamp = meeting.started_at ?? meeting.created_at;
  return `${formatDateTime(timestamp)} · ${formatDurationMinutes(meeting.duration_sec)}`;
}

/** First two letters of the title, uppercased — this fixture never had photos,
 *  only initials, per the design's `InitialsAvatar`. */
export function initialsFromTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return '?';
  }
  const words = trimmed.split(/\s+/);
  const initials = words.length >= 2 ? `${words[0][0]}${words[1][0]}` : trimmed.slice(0, 2);
  return initials.toUpperCase();
}
