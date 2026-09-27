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

export interface RecordingState {
  phase: RecordingPhase;
  meetingId: string | null;
  quality: RecordingQuality;
  startedAt: number | null;
  pausedMs: number;
  pausedAt: number | null;
  lines: LiveLine[];
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
  partial: null,
  volume: 0,
  sync: { pending: 0, online: true },
  problem: null,
  endedMeetingId: null,
};

export const useRecordingStore = create<RecordingState>(() => INITIAL);

export const resetRecordingStore = () => useRecordingStore.setState(INITIAL);

/** Recorded time so far, pauses excluded (US-09). */
export function elapsedMs(state: Pick<RecordingState, 'startedAt' | 'pausedMs' | 'pausedAt'>, now: number): number {
  if (state.startedAt === null) return 0;
  const openPause = state.pausedAt === null ? 0 : now - state.pausedAt;
  return Math.max(0, now - state.startedAt - state.pausedMs - openPause);
}
