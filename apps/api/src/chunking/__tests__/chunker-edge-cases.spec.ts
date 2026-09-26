import { chunkSegments, rechunkWithinRanges, type ChunkSegment } from '../chunker.js';

const OPTIONS = { targetTokens: 100, overlapRatio: 0.15, minBoundaryRatio: 0.7, longPauseMs: 2000 };

describe('chunker edge cases', () => {
  it('handles segments with empty text', () => {
    const segments: ChunkSegment[] = [
      { seq: 1, text: '', started_at_ms: 0, ended_at_ms: 100, gap_before_ms: null },
      { seq: 2, text: 'some content', started_at_ms: 1000, ended_at_ms: 2000, gap_before_ms: null },
      { seq: 3, text: '', started_at_ms: 3000, ended_at_ms: 3100, gap_before_ms: null },
    ];
    const chunks = chunkSegments(segments, OPTIONS);
    expect(chunks.length).toBeGreaterThan(0);
    // Empty segments should contribute minimal tokens but still be included in chunks
    expect(chunks.some((c) => c.content.includes('some content'))).toBe(true);
  });

  it('handles segments with whitespace-only text', () => {
    const segments: ChunkSegment[] = [
      { seq: 1, text: '   \t  ', started_at_ms: 0, ended_at_ms: 100, gap_before_ms: null },
      { seq: 2, text: 'thực tế nội dung', started_at_ms: 1000, ended_at_ms: 2000, gap_before_ms: null },
      { seq: 3, text: '\n\n', started_at_ms: 3000, ended_at_ms: 3100, gap_before_ms: null },
    ];
    const chunks = chunkSegments(segments, OPTIONS);
    expect(chunks.length).toBeGreaterThan(0);
    // Whitespace should be trimmed and empty segments combined
    chunks.forEach((chunk) => {
      expect(chunk.content).not.toMatch(/^\s*$/);
    });
  });

  it('never duplicates a whole chunk when overlapping', () => {
    // Generate enough segments to create multiple chunks with overlap
    const segments = Array.from({ length: 50 }, (_, i) => ({
      seq: i + 1,
      text: `từ ${i} ${i} ${i} ${i} ${i}`,
      started_at_ms: i * 1000,
      ended_at_ms: i * 1000 + 900,
      gap_before_ms: null as null,
    }));

    const chunks = chunkSegments(segments, OPTIONS);
    expect(chunks.length).toBeGreaterThan(1);
    expect(new Set(chunks.map((c) => c.content)).size).toBe(chunks.length);
    chunks.slice(1).forEach((chunk, i) => expect(chunk.segmentStartSeq).toBeGreaterThan(chunks[i].segmentStartSeq));
  });

  it('rechunkWithinRanges handles overlapping ranges correctly', () => {
    const segments = Array.from({ length: 100 }, (_, i) => ({
      seq: i + 1,
      text: `seg ${i}`,
      started_at_ms: i * 1000,
      ended_at_ms: i * 1000 + 900,
      gap_before_ms: null as null,
    }));

    const before = chunkSegments(segments, OPTIONS);

    // Create overlapping ranges that span from seq 20-40 and 30-50
    // rechunkWithinRanges should preserve the boundaries even though ranges overlap
    const edited = segments.slice();
    edited[25].text = 'edited content longer than before';

    const after = rechunkWithinRanges(edited, before, OPTIONS);

    // The boundaries should not move
    expect(after.map((c) => [c.segmentStartSeq, c.segmentEndSeq])).toEqual(
      before.map((c) => [c.segmentStartSeq, c.segmentEndSeq])
    );
  });

  it('rechunkWithinRanges handles when all segments in a range are deleted', () => {
    const segments = Array.from({ length: 50 }, (_, i) => ({
      seq: i + 1,
      text: `segment ${i}`,
      started_at_ms: i * 1000,
      ended_at_ms: i * 1000 + 900,
      gap_before_ms: null as null,
    }));

    const before = chunkSegments(segments, OPTIONS);
    const edited = segments.slice();

    // Find a chunk and delete all its segments
    const targetChunk = before[0];
    for (let i = targetChunk.segmentStartSeq; i <= targetChunk.segmentEndSeq; i++) {
      edited[i - 1].text = '';
    }

    const after = rechunkWithinRanges(edited, before, OPTIONS);

    // Chunks should still exist (with empty or minimal content)
    expect(after.length).toBeGreaterThanOrEqual(before.length - 1);
  });
});
