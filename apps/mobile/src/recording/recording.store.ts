import { create } from 'zustand';
import type { RecordingQuality } from '@meetio/shared';

/**
 * Live state of the recording session on THIS device — client state, not server data (the
 * server's copy is read through TanStack Query elsewhere). `lines` holds what the screen shows;
 * the durable copy is the on-disk queue and, once acked, PostgreSQL.
 */
export type RecordingPhase = 'idle' | 'recording' | 'paused' | 'ending';

export interface LiveLine {
  seq: number;
  text: string;
  startedAtMs: number;
  endedAtMs: number;
  gapBeforeMs: number | null;
}

/**
 * One line's on-device translation (Phase 21). `pending`: queued or running — it counts when ending,
 * which waits for it. A line with no entry is not being translated (translation off).
 */
export type LiveTranslation = { status: 'pending' } | { status: 'done'; text: string; to: string } | { status: 'failed' };

export interface RecordingState {
  phase: RecordingPhase;
  meetingId: string | null;
  quality: RecordingQuality;
  startedAt: number | null;
  pausedMs: number;
  pausedAt: number | null;
  lines: LiveLine[];
  /** Translations by seq, filled by the recording session's on-device translator. */
  translations: Record<number, LiveTranslation>;
  partial: string | null;
  volume: number;
  sync: { pending: number; online: boolean };
  /** User-facing reason the session needs attention (engine refused, consent). */
  problem: string | null;
  /** Set once the last meeting's `end` was accepted by the server — the screen moves on to it. */
  endedMeetingId: string | null;
}

const INITIAL: RecordingState = {
  phase: 'idle',
  meetingId: null,
  quality: 'high',
  startedAt: null,
  pausedMs: 0,
  pausedAt: null,
  lines: [],
  translations: {},
  partial: null,
  volume: 0,
  sync: { pending: 0, online: true },
  problem: null,
  endedMeetingId: null,
};

export const useRecordingStore = create<RecordingState>(() => INITIAL);

export const resetRecordingStore = () => useRecordingStore.setState(INITIAL);

/** Records a line's translation state — only for the meeting being recorded (a late result of a previous one is ignored). */
export function setLiveTranslation(meetingId: string, seq: number, value: LiveTranslation): void {
  useRecordingStore.setState((s) => {
    if (s.meetingId !== meetingId) return s;
    return { translations: { ...s.translations, [seq]: value } };
  });
}

/** Recorded time so far, pauses excluded (US-09). */
export function elapsedMs(state: Pick<RecordingState, 'startedAt' | 'pausedMs' | 'pausedAt'>, now: number): number {
  if (state.startedAt === null) return 0;
  const openPause = state.pausedAt === null ? 0 : now - state.pausedAt;
  return Math.max(0, now - state.startedAt - state.pausedMs - openPause);
}
