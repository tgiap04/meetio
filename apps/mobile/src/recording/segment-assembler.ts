import type { NewSegment } from '../queue/segment-queue';

/** Gaps shorter than this are restart jitter, not a hole in the transcript worth showing. */
export const GAP_MARK_MIN_MS = 1000;

export interface SegmentAssemblerDeps {
  now: () => number;
  /** Wall-clock start of the meeting; segment times are ms since then (pauses included, like the clock on the wall). */
  meetingStartedAt: number;
  onPartial(text: string | null): void;
  onSegment(segment: NewSegment): void;
}

/**
 * Turns engine results into transcript segments. Each `final` is one utterance (US-08): it
 * starts at the utterance's first partial — or, when partials are off (quality `standard`), at
 * the previous boundary — and ends when it was finalised. A recorded gap rides on the NEXT
 * segment as `gap_before_ms`, which is how the transcript shows "— gián đoạn N giây —".
 */
export function createSegmentAssembler(deps: SegmentAssemblerDeps) {
  let utteranceStart: number | null = null;
  let boundary = deps.now();
  let lastPartial = '';
  let pendingGapMs = 0;

  const rel = (t: number) => Math.max(0, t - deps.meetingStartedAt);

  function final(text: string) {
    const now = deps.now();
    const clean = text.trim();
    const startedAt = utteranceStart ?? boundary;
    utteranceStart = null;
    lastPartial = '';
    boundary = now;
    deps.onPartial(null);
    if (!clean) return;
    const segment: NewSegment = { text: clean, started_at_ms: rel(startedAt), ended_at_ms: rel(now) };
    if (pendingGapMs >= GAP_MARK_MIN_MS) segment.gap_before_ms = pendingGapMs;
    pendingGapMs = 0;
    deps.onSegment(segment);
  }

  return {
    partial(text: string) {
      utteranceStart ??= deps.now();
      lastPartial = text;
      deps.onPartial(text);
    },
    final,
    gap(ms: number) {
      pendingGapMs += ms;
    },
    /** The session died mid-utterance: keep the words heard so far rather than lose them. */
    flush() {
      if (lastPartial.trim()) final(lastPartial);
      else {
        utteranceStart = null;
        deps.onPartial(null);
      }
    },
    /** Recognition (re)started after a pause: the next utterance cannot begin before now. */
    markBoundary() {
      boundary = deps.now();
    },
  };
}

export type SegmentAssembler = ReturnType<typeof createSegmentAssembler>;
