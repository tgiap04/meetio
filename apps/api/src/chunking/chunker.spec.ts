import { chunkContentHash, chunkSegments, estimateTokens, rechunkWithinRanges, type ChunkSegment } from './chunker.js';

const OPTIONS = { targetTokens: 100, overlapRatio: 0.15, minBoundaryRatio: 0.7, longPauseMs: 2000 };

/** Segments of ~`words` short Vietnamese words, one second apart, with optional pauses before given seqs. */
function transcript(count: number, words = 6, pausesBefore: Record<number, number> = {}): ChunkSegment[] {
  let clock = 0;
  return Array.from({ length: count }, (_, i) => {
    const seq = i + 1;
    clock += 1000 + (pausesBefore[seq] ?? 0);
    const text = Array.from({ length: words }, (_, w) => `từ${seq}_${w}`).join(' ');
    return { seq, text, started_at_ms: clock, ended_at_ms: clock + 900, gap_before_ms: null };
  });
}

describe('chunkSegments', () => {
  it('returns nothing for an empty transcript and one chunk for a short one', () => {
    expect(chunkSegments([], OPTIONS)).toEqual([]);
    const chunks = chunkSegments(transcript(3), OPTIONS);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ segmentStartSeq: 1, segmentEndSeq: 3 });
  });

  it('covers every segment, stays near the token target, and overlaps consecutive chunks by ~15%', () => {
    const segments = transcript(200);
    const chunks = chunkSegments(segments, OPTIONS);
    const covered = new Set<number>();
    chunks.forEach((c) => {
      for (let s = c.segmentStartSeq; s <= c.segmentEndSeq; s++) covered.add(s);
      expect(c.estimatedTokens).toBeLessThanOrEqual(OPTIONS.targetTokens);
    });
    expect(covered.size).toBe(200);
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const overlapSegments = prev.segmentEndSeq - chunks[i].segmentStartSeq + 1;
      const prevSegments = prev.segmentEndSeq - prev.segmentStartSeq + 1;
      expect(overlapSegments).toBeGreaterThanOrEqual(1);
      expect(overlapSegments / prevSegments).toBeLessThanOrEqual(0.2);
      expect(chunks[i].segmentStartSeq).toBeGreaterThan(prev.segmentStartSeq);
    }
  });

  it('prefers to end a chunk at a long pause instead of mid-thought', () => {
    const plain = chunkSegments(transcript(60), OPTIONS);
    const cut = plain[0].segmentEndSeq - 1; // a pause just before the natural end
    const withPause = chunkSegments(transcript(60, 6, { [cut + 1]: 5000 }), OPTIONS);
    expect(withPause[0].segmentEndSeq).toBe(cut);
  });

  it('treats a recogniser restart gap as a pause too', () => {
    const segments = transcript(60);
    const cut = chunkSegments(segments, OPTIONS)[0].segmentEndSeq - 1;
    segments[cut].gap_before_ms = 4000; // seq cut+1 is index cut
    expect(chunkSegments(segments, OPTIONS)[0].segmentEndSeq).toBe(cut);
  });

  it('ignores short pauses', () => {
    const plain = chunkSegments(transcript(60), OPTIONS);
    const withShort = chunkSegments(transcript(60, 6, { [plain[0].segmentEndSeq]: 500 }), OPTIONS);
    expect(withShort[0].segmentEndSeq).toBe(plain[0].segmentEndSeq);
  });

  it('gives an oversized single segment its own chunk and keeps going', () => {
    const segments = transcript(5);
    segments[1].text = 'dài '.repeat(400);
    const chunks = chunkSegments(segments, OPTIONS);
    expect(chunks.some((c) => c.segmentStartSeq === 2 && c.segmentEndSeq === 2)).toBe(true);
    expect(chunks[chunks.length - 1].segmentEndSeq).toBe(5);
  });

  it('is deterministic', () => {
    expect(chunkSegments(transcript(200), OPTIONS)).toEqual(chunkSegments(transcript(200), OPTIONS));
  });

  it('re-chunking within existing ranges changes only the chunks containing an edit — even one that changes its length', () => {
    const before = chunkSegments(transcript(200), OPTIONS);
    const edited = transcript(200);
    edited[149].text = 'một câu đã sửa dài hơn hẳn bản gốc rất nhiều từ để làm lệch mọi ranh giới phía sau nếu cắt lại từ đầu';
    // Cutting from scratch would move later boundaries…
    const fresh = chunkSegments(edited, OPTIONS);
    expect(fresh.filter((c) => c.segmentStartSeq > 150).map((c) => c.contentHash)).not.toEqual(
      before.filter((c) => c.segmentStartSeq > 150).map((c) => c.contentHash),
    );
    // …keeping the ranges does not.
    const after = rechunkWithinRanges(edited, before, OPTIONS);
    expect(after.map((c) => [c.segmentStartSeq, c.segmentEndSeq])).toEqual(before.map((c) => [c.segmentStartSeq, c.segmentEndSeq]));
    after.forEach((c, i) => {
      const contains150 = c.segmentStartSeq <= 150 && c.segmentEndSeq >= 150;
      expect(c.contentHash === before[i].contentHash).toBe(!contains150);
    });
  });

  it('chunks segments that arrived after the last range', () => {
    const early = chunkSegments(transcript(50), OPTIONS);
    const after = rechunkWithinRanges(transcript(80), early, OPTIONS);
    expect(after.slice(0, early.length).map((c) => c.contentHash)).toEqual(early.map((c) => c.contentHash));
    expect(after[after.length - 1].segmentEndSeq).toBe(80);
    expect(after[early.length].segmentStartSeq).toBe(51);
  });

  it('hashes "start:end:content" with sha256, like migration 015', () => {
    expect(chunkContentHash(1, 2, 'xin chào')).toMatch(/^[0-9a-f]{64}$/);
    expect(chunkContentHash(1, 2, 'xin chào')).not.toBe(chunkContentHash(1, 3, 'xin chào'));
    expect(estimateTokens('')).toBe(1);
  });
});
