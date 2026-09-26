import { createHash } from 'node:crypto';

export interface ChunkSegment {
  seq: number;
  text: string;
  started_at_ms: number;
  ended_at_ms: number;
  gap_before_ms: number | null;
}

export interface ChunkDraft {
  segmentStartSeq: number;
  segmentEndSeq: number;
  content: string;
  /** Boundary heuristic only — the stored token_count comes from Gemini countTokens at embed time. */
  estimatedTokens: number;
  contentHash: string;
}

export interface ChunkerOptions {
  targetTokens: number;
  overlapRatio: number;
  /** A boundary may move back to this share of the target to land on a pause. */
  minBoundaryRatio: number;
  /** Silence (or a recogniser restart gap) at least this long is a preferred cut. */
  longPauseMs: number;
}

export const DEFAULT_CHUNKER_OPTIONS: ChunkerOptions = {
  targetTokens: 800,
  overlapRatio: 0.15,
  minBoundaryRatio: 0.7,
  longPauseMs: 2000,
};

/**
 * Rough token count used only to decide where chunks end. ~3.5 characters per
 * token is close to what Gemini's tokenizer gives on Vietnamese text; an
 * approximate boundary is harmless, an approximate stored count would not be.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.5));
}

/** Same formula as migration 1758000000015, so rows it hashed are recognised. */
export function chunkContentHash(start: number, end: number, content: string): string {
  return createHash('sha256').update(`${start}:${end}:${content}`, 'utf8').digest('hex');
}

const pauseBefore = (prev: ChunkSegment, next: ChunkSegment) =>
  Math.max(next.gap_before_ms ?? 0, next.started_at_ms - prev.ended_at_ms);

/**
 * Groups consecutive transcript segments into ~800-token chunks that overlap
 * by ~15% (phase-12 "Kiến trúc"). A chunk prefers to end at a long pause or a
 * restart gap rather than mid-thought; there is no speaker change to cut on
 * (US-13 dropped). Deterministic: the same segments always give the same
 * chunks, which is what lets a re-run keep the unchanged ones.
 */
export function chunkSegments(segments: readonly ChunkSegment[], options: ChunkerOptions = DEFAULT_CHUNKER_OPTIONS): ChunkDraft[] {
  const tokens = segments.map((s) => estimateTokens(s.text));
  const chunks: ChunkDraft[] = [];
  let start = 0;

  while (start < segments.length) {
    let end = start;
    let total = tokens[start];
    while (end + 1 < segments.length && total + tokens[end + 1] <= options.targetTokens) {
      end++;
      total += tokens[end];
    }

    if (end + 1 < segments.length) {
      end = preferPause(segments, tokens, start, end, options);
    }

    const slice = segments.slice(start, end + 1);
    const content = slice.map((s) => s.text.trim()).join(' ');
    chunks.push({
      segmentStartSeq: slice[0].seq,
      segmentEndSeq: slice[slice.length - 1].seq,
      content,
      estimatedTokens: tokens.slice(start, end + 1).reduce((a, b) => a + b, 0),
      contentHash: chunkContentHash(slice[0].seq, slice[slice.length - 1].seq, content),
    });
    if (end + 1 >= segments.length) break;
    start = overlapStart(tokens, start, end, options);
  }
  return chunks;
}

export interface ChunkRange {
  segmentStartSeq: number;
  segmentEndSeq: number;
}

/**
 * Re-chunk after transcript edits WITHOUT moving any boundary: each existing
 * seq range keeps its place and only its text is rebuilt, so a correction that
 * makes one segment longer or shorter changes exactly the chunks containing it
 * (US-24) — re-cutting from scratch would shift every later boundary and force
 * re-embedding, and re-extracting, the rest of the meeting. Segments past the
 * last range (a late upload) are chunked fresh.
 */
export function rechunkWithinRanges(
  segments: readonly ChunkSegment[],
  ranges: readonly ChunkRange[],
  options: ChunkerOptions = DEFAULT_CHUNKER_OPTIONS,
): ChunkDraft[] {
  const sorted = [...ranges].sort((a, b) => a.segmentStartSeq - b.segmentStartSeq);
  const drafts: ChunkDraft[] = [];
  for (const range of sorted) {
    const slice = segments.filter((s) => s.seq >= range.segmentStartSeq && s.seq <= range.segmentEndSeq);
    if (slice.length === 0) continue;
    const content = slice.map((s) => s.text.trim()).join(' ');
    drafts.push({
      segmentStartSeq: range.segmentStartSeq,
      segmentEndSeq: range.segmentEndSeq,
      content,
      estimatedTokens: slice.reduce((sum, s) => sum + estimateTokens(s.text), 0),
      contentHash: chunkContentHash(range.segmentStartSeq, range.segmentEndSeq, content),
    });
  }
  const lastEnd = sorted.length > 0 ? sorted[sorted.length - 1].segmentEndSeq : 0;
  return [...drafts, ...chunkSegments(segments.filter((s) => s.seq > lastEnd), options)];
}

/** Within the last (1 - minBoundaryRatio) of the window, end at the longest pause if it is long enough. */
function preferPause(segments: readonly ChunkSegment[], tokens: number[], start: number, end: number, options: ChunkerOptions): number {
  let running = 0;
  let best = end;
  let bestPause = 0;
  for (let k = start; k <= end; k++) {
    running += tokens[k];
    if (running < options.targetTokens * options.minBoundaryRatio) continue;
    const pause = pauseBefore(segments[k], segments[k + 1]);
    if (pause > bestPause) {
      bestPause = pause;
      best = k;
    }
  }
  return bestPause >= options.longPauseMs ? best : end;
}

/** Next chunk starts far enough back to repeat ~overlapRatio of this one — always moving forward. */
function overlapStart(tokens: number[], start: number, end: number, options: ChunkerOptions): number {
  const chunkTokens = tokens.slice(start, end + 1).reduce((a, b) => a + b, 0);
  let next = end + 1;
  let overlap = 0;
  while (next - 1 > start && overlap + tokens[next - 1] <= chunkTokens * options.overlapRatio) {
    next--;
    overlap += tokens[next];
  }
  return next;
}
