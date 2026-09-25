import type { TranscriptSegmentPayload } from '../websocket/websocket.types';

/**
 * `POST /meetings/:id/segments/bulk` — the REST fallback for catch-up sync
 * (api-spec §4). Same upsert as the WebSocket path: idempotent on `(meeting_id, seq)`.
 */
export interface BulkSegmentsRequest {
  segments: TranscriptSegmentPayload[];
}

/** Every seq listed is durable in PostgreSQL — new or an earlier duplicate. */
export interface BulkSegmentsResponse {
  acked_seqs: number[];
}
