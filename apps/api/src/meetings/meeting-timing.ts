import type { Meeting } from '../database/entities/index.js';

/**
 * Paused time never counts toward `duration_sec` (US-09). `paused_at` marks an
 * open pause; `resume` folds it into `paused_duration_ms`.
 */
type TimedMeeting = Pick<Meeting, 'started_at' | 'paused_at' | 'paused_duration_ms'>;

export function openPause(meeting: TimedMeeting, now: Date): void {
  meeting.paused_at = now;
}

export function closePause(meeting: TimedMeeting, now: Date): void {
  if (meeting.paused_at) {
    meeting.paused_duration_ms += Math.max(0, now.getTime() - meeting.paused_at.getTime());
  }
  meeting.paused_at = null;
}

/** Recorded time up to `endedAt`, excluding every pause — including one still open when it ends. */
export function recordedDurationSec(meeting: TimedMeeting, endedAt: Date): number | null {
  if (!meeting.started_at) {
    return null;
  }
  const openPauseMs = meeting.paused_at ? Math.max(0, endedAt.getTime() - meeting.paused_at.getTime()) : 0;
  const wallMs = endedAt.getTime() - meeting.started_at.getTime();
  return Math.max(0, Math.floor((wallMs - meeting.paused_duration_ms - openPauseMs) / 1000));
}
