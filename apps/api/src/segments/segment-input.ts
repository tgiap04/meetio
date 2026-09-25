import type { TranscriptSegmentPayload } from '@meetio/shared';

/** One finalised segment as it arrives over WebSocket or the bulk endpoint (api-spec §4, §8). */
export type SegmentInput = Pick<TranscriptSegmentPayload, 'seq' | 'text' | 'started_at_ms' | 'ended_at_ms' | 'gap_before_ms'>;
