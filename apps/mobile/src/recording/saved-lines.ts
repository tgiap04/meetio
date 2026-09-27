import type { LiveLine } from './recording.store';

export interface SavedSegment {
  seq: number;
  text: string;
  started_at_ms: number;
  ended_at_ms: number;
  gap_before_ms?: number | null;
}

export const toLine = (s: SavedSegment): LiveLine => ({
  seq: s.seq,
  text: s.text,
  startedAtMs: s.started_at_ms,
  endedAtMs: s.ended_at_ms,
  gapBeforeMs: s.gap_before_ms ?? null,
});

/** Everything saved for a meeting, by seq: the server copy wins, the local queue fills the rest (US-15). */
export function mergeSavedLines(local: SavedSegment[], server: SavedSegment[]): LiveLine[] {
  const bySeq = new Map<number, LiveLine>();
  for (const s of local) bySeq.set(s.seq, toLine(s));
  for (const s of server) bySeq.set(s.seq, toLine(s));
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}
