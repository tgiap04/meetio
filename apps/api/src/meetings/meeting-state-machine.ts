import { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import { InvalidStateTransitionException } from './invalid-state-transition.exception.js';

/**
 * The one place that decides which lifecycle moves are legal
 * (docs/system-architecture.md §1). Every status change in the API goes
 * through `transition()`; scattering `if (status === …)` checks across services
 * is how two code paths end up disagreeing about what "ended" allows.
 *
 * The pipeline moves (`enqueue` onwards) are listed now so Phase 11 plugs into
 * the same table instead of growing a second one.
 */
export type MeetingAction =
  | 'pause'
  | 'resume'
  | 'end'
  | 'enqueue'
  | 'start_processing'
  | 'complete'
  | 'fail'
  | 'requeue';

const TRANSITIONS: Record<MeetingAction, { from: readonly MeetingStatus[]; to: MeetingStatus }> = {
  pause: { from: [MeetingStatus.RECORDING], to: MeetingStatus.PAUSED },
  resume: { from: [MeetingStatus.PAUSED], to: MeetingStatus.RECORDING },
  end: { from: [MeetingStatus.RECORDING, MeetingStatus.PAUSED], to: MeetingStatus.ENDED },
  enqueue: { from: [MeetingStatus.ENDED], to: MeetingStatus.QUEUED },
  start_processing: { from: [MeetingStatus.QUEUED], to: MeetingStatus.PROCESSING },
  complete: { from: [MeetingStatus.PROCESSING], to: MeetingStatus.READY },
  fail: { from: [MeetingStatus.PROCESSING], to: MeetingStatus.FAILED },
  // Retry after failure (US-29), or re-run after a transcript edit on a ready meeting.
  requeue: { from: [MeetingStatus.FAILED, MeetingStatus.READY], to: MeetingStatus.QUEUED },
};

/** Returns the status `action` leads to, or throws 409 `INVALID_STATE_TRANSITION`. */
export function transition(current: MeetingStatus, action: MeetingAction): MeetingStatus {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(current)) {
    throw new InvalidStateTransitionException(current, action);
  }
  return rule.to;
}

// The pipeline has not read the transcript before `processing`, so a late
// segment (e.g. resent after the 24h auto-close) is still worth keeping. From
// `processing` on it would silently diverge from the AI output (clarifications 2026-09-25).
const ACCEPTS_SEGMENTS: readonly MeetingStatus[] = [
  MeetingStatus.RECORDING,
  MeetingStatus.PAUSED,
  MeetingStatus.ENDED,
  MeetingStatus.QUEUED,
];

export function acceptsSegments(status: MeetingStatus): boolean {
  return ACCEPTS_SEGMENTS.includes(status);
}
