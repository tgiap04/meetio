import type { SegmentInput } from './segment-input.js';

/** Cross-field rule class-validator cannot express on one property. Returns a reason or null. */
export function segmentRuleViolation(segment: SegmentInput): string | null {
  if (segment.ended_at_ms < segment.started_at_ms) {
    return 'ended_at_ms phải lớn hơn hoặc bằng started_at_ms';
  }
  return null;
}
