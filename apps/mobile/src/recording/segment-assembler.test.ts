import type { NewSegment } from '../queue/segment-queue';
import { createSegmentAssembler } from './segment-assembler';

describe('segment-assembler', () => {
  let clock = 0;
  let segments: NewSegment[] = [];
  let partials: (string | null)[] = [];

  const now = () => clock;

  const onSegment = (segment: NewSegment) => {
    segments.push(segment);
  };

  const onPartial = (text: string | null) => {
    partials.push(text);
  };

  const assembler = createSegmentAssembler({
    now,
    meetingStartedAt: 1000,
    onPartial,
    onSegment,
  });

  beforeEach(() => {
    clock = 1000;
    segments = [];
    partials = [];
  });

  describe('partial → final → segment', () => {
    it('creates a segment from a final with timestamp relative to meetingStartedAt', () => {
      clock = 1000;
      assembler.partial('Hello');
      clock = 2000;
      assembler.final('Hello world');

      expect(segments).toHaveLength(1);
      expect(segments[0]).toMatchObject({
        text: 'Hello world',
        started_at_ms: 0, // 1000 - 1000
        ended_at_ms: 1000, // 2000 - 1000
      });
    });

    it('trims the final text', () => {
      clock = 1000;
      assembler.partial('  text  ');
      clock = 1100;
      assembler.final('  text  ');

      expect(segments[0].text).toBe('text');
    });

    it('does not create a segment for an empty final', () => {
      clock = 1000;
      assembler.partial('');
      clock = 1100;
      assembler.final('   ');

      expect(segments).toHaveLength(0);
    });

    it('sets started_at_ms from the first partial time', () => {
      clock = 2000;
      assembler.partial('Hello');
      clock = 2500;
      assembler.final('Hello world');

      expect(segments[0].started_at_ms).toBe(1000); // 2000 - 1000
    });

    it('sets started_at_ms from boundary if no partial occurred', () => {
      clock = 3000;
      assembler.markBoundary();
      clock = 3500;
      assembler.final('Hello');

      expect(segments[0].started_at_ms).toBe(2000); // 3000 - 1000
    });

    it('ends at the time final() is called', () => {
      clock = 2000;
      assembler.partial('text');
      clock = 3500;
      assembler.final('text');

      expect(segments[0].ended_at_ms).toBe(2500); // 3500 - 1000
    });
  });

  describe('gap handling', () => {
    it('attaches gap ≥ GAP_MARK_MIN_MS to the next segment', () => {
      clock = 1000;
      assembler.partial('First');
      clock = 2000;
      assembler.final('First');

      clock = 4000; // 2s gap (>= 1000ms)
      assembler.gap(2000);

      clock = 4500;
      assembler.partial('Second');
      clock = 5000;
      assembler.final('Second');

      expect(segments).toHaveLength(2);
      expect(segments[0].gap_before_ms).toBeUndefined();
      expect(segments[1].gap_before_ms).toBe(2000);
    });

    it('does not attach gap < GAP_MARK_MIN_MS', () => {
      clock = 1000;
      assembler.partial('First');
      clock = 2000;
      assembler.final('First');

      clock = 2500; // 500ms gap (< 1000ms)
      assembler.gap(500);

      clock = 3000;
      assembler.partial('Second');
      clock = 3500;
      assembler.final('Second');

      expect(segments[1].gap_before_ms).toBeUndefined();
    });

    it('accumulates multiple gaps before the next segment', () => {
      clock = 1000;
      assembler.partial('First');
      clock = 2000;
      assembler.final('First');

      assembler.gap(600);
      assembler.gap(600); // Total 1200ms

      clock = 3000;
      assembler.partial('Second');
      clock = 3500;
      assembler.final('Second');

      expect(segments[1].gap_before_ms).toBe(1200);
    });

    it('resets pending gap after attaching to a segment', () => {
      clock = 1000;
      assembler.partial('First');
      clock = 2000;
      assembler.final('First');

      assembler.gap(2000);

      clock = 3000;
      assembler.partial('Second');
      clock = 4000;
      assembler.final('Second');

      clock = 5000;
      assembler.partial('Third');
      clock = 6000;
      assembler.final('Third');

      expect(segments[1].gap_before_ms).toBe(2000);
      expect(segments[2].gap_before_ms).toBeUndefined();
    });
  });

  describe('partial tracking', () => {
    it('emits partial text', () => {
      assembler.partial('Hello');
      expect(partials).toContain('Hello');
    });

    it('clears partial on final', () => {
      clock = 1000;
      assembler.partial('text');
      clock = 1100;
      assembler.final('text');

      expect(partials[partials.length - 1]).toBeNull();
    });

    it('clears partial when flushing an empty utterance', () => {
      clock = 1000;
      assembler.partial('');
      clock = 1100;
      assembler.flush();

      expect(partials[partials.length - 1]).toBeNull();
    });
  });

  describe('flush', () => {
    it('creates a segment from the last partial on flush', () => {
      clock = 2000;
      assembler.partial('Hello');
      clock = 2500;
      assembler.partial('Hello world');
      assembler.flush();

      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('Hello world');
    });

    it('does not create a segment if there is no partial text', () => {
      clock = 1000;
      assembler.flush();

      expect(segments).toHaveLength(0);
    });

    it('does not create a segment if partial is whitespace-only', () => {
      clock = 1000;
      assembler.partial('   ');
      assembler.flush();

      expect(segments).toHaveLength(0);
    });

    it('clears the partial after flush', () => {
      clock = 1000;
      assembler.partial('text');
      assembler.flush();

      expect(partials[partials.length - 1]).toBeNull();
    });

    it('captures pending gap when flushing', () => {
      clock = 1000;
      assembler.partial('First');
      clock = 2000;
      assembler.final('First');

      assembler.gap(1500);
      clock = 3000;
      assembler.partial('Second');
      assembler.flush();

      expect(segments[1].gap_before_ms).toBe(1500);
    });
  });

  describe('boundary marking', () => {
    it('uses partial time when one has occurred, not boundary', () => {
      clock = 2000;
      assembler.markBoundary();
      clock = 2500;
      assembler.partial('text');
      clock = 3000;
      assembler.final('text');

      // started_at_ms uses utteranceStart (from partial), not boundary
      expect(segments[0].started_at_ms).toBe(1500); // 2500 - 1000
    });

    it('uses boundary when no partial has occurred yet', () => {
      clock = 1000;
      assembler.markBoundary();
      clock = 2000;
      // No partial, just go straight to final
      assembler.final('text');

      // started_at_ms uses boundary (1000), since utteranceStart was never set
      expect(segments[0].started_at_ms).toBe(0); // 1000 - 1000
    });
  });

  describe('times relative to meetingStartedAt', () => {
    it('handles negative offset gracefully', () => {
      clock = 500; // Before meeting started
      assembler.partial('early');
      clock = 600;
      assembler.final('early');

      expect(segments[0].started_at_ms).toBe(0); // Clamped, 500 - 1000 = -500 → max(0, -500)
      expect(segments[0].ended_at_ms).toBe(0); // 600 - 1000 = -400 → max(0, -400)
    });

    it('measures time from meetingStartedAt exactly', () => {
      const meetingStart = 5000;
      const segments2: NewSegment[] = [];
      const asm = createSegmentAssembler({
        now,
        meetingStartedAt: meetingStart,
        onPartial: () => {},
        onSegment: (s) => segments2.push(s),
      });

      clock = 5000;
      asm.partial('start');
      clock = 6500;
      asm.final('start');

      expect(segments2[0]).toMatchObject({
        started_at_ms: 0,
        ended_at_ms: 1500,
      });
    });
  });

  describe('multiple utterances in sequence', () => {
    it('tracks three utterances with correct boundaries', () => {
      clock = 1000;
      assembler.partial('First');
      clock = 1500;
      assembler.final('First');

      clock = 2000;
      assembler.partial('Second');
      clock = 2500;
      assembler.final('Second');

      clock = 3000;
      assembler.partial('Third');
      clock = 3500;
      assembler.final('Third');

      expect(segments).toHaveLength(3);
      expect(segments[0].text).toBe('First');
      expect(segments[1].text).toBe('Second');
      expect(segments[2].text).toBe('Third');
      expect(segments[0].started_at_ms).toBe(0);
      expect(segments[1].started_at_ms).toBe(1000);
      expect(segments[2].started_at_ms).toBe(2000);
    });
  });
});
