import type { MeetingListItem, MeetingStatus } from '@meetio/shared';
import type { RecordingPhase } from '../recording/recording.store';

/**
 * What the home-screen widget shows. The widget renders in a headless JS task that may run while
 * the app is not open, so it never reads app state or calls the API — the app writes this snapshot
 * (widget-snapshot-file.ts) and the widget only reads it.
 */
export interface WidgetSnapshot {
  v: 1;
  signedIn: boolean;
  /** A meeting is being recorded (or paused) on this phone right now. */
  recording: boolean;
  /** Null until the to-do count has loaded at least once. */
  openActions: number | null;
  /** `title` is null when the app lock is on: the home screen is visible to anyone holding the phone. */
  lastMeeting: { id: string; title: string | null; status: MeetingStatus } | null;
  updatedAt: number;
}

export const SIGNED_OUT_SNAPSHOT: WidgetSnapshot = {
  v: 1,
  signedIn: false,
  recording: false,
  openActions: null,
  lastMeeting: null,
  updatedAt: 0,
};

export interface WidgetSnapshotInput {
  latestMeeting: MeetingListItem | undefined;
  openActions: number | undefined;
  recordingPhase: RecordingPhase;
  appLockEnabled: boolean;
  now: number;
}

export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const { latestMeeting, openActions, recordingPhase, appLockEnabled, now } = input;
  return {
    v: 1,
    signedIn: true,
    recording: recordingPhase === 'recording' || recordingPhase === 'paused',
    openActions: openActions ?? null,
    lastMeeting: latestMeeting
      ? { id: latestMeeting.id, title: appLockEnabled ? null : latestMeeting.title, status: latestMeeting.status }
      : null,
    updatedAt: now,
  };
}

/** Accepts only a well-formed v1 snapshot; anything else (missing, corrupt, older shape) reads as signed out. */
export function parseWidgetSnapshot(raw: string | null): WidgetSnapshot {
  if (!raw) return SIGNED_OUT_SNAPSHOT;
  try {
    const value = JSON.parse(raw) as Partial<WidgetSnapshot>;
    if (value?.v !== 1 || typeof value.signedIn !== 'boolean') return SIGNED_OUT_SNAPSHOT;
    return { ...SIGNED_OUT_SNAPSHOT, ...value } as WidgetSnapshot;
  } catch {
    return SIGNED_OUT_SNAPSHOT;
  }
}

/** Whether two snapshots render the same widget — `updatedAt` alone never warrants a redraw. */
export function sameWidgetContent(a: WidgetSnapshot, b: WidgetSnapshot): boolean {
  return JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });
}
