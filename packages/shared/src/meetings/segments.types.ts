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

/** One row of `GET /meetings/:id/segments` (api-spec §4). No speaker field (US-13 dropped). */
export interface TranscriptSegmentItem {
  id: string;
  seq: number;
  text: string;
  started_at_ms: number;
  ended_at_ms: number;
  /** Recogniser restart gap before this segment — the UI shows it, never hides it. */
  gap_before_ms: number | null;
  is_edited: boolean;
  translated_text: string | null;
  translated_to: string | null;
}

/** `GET /meetings/:id/segments?from_seq=&limit=` — ordered by seq; `from_seq` is inclusive. */
export interface ListSegmentsQuery {
  from_seq?: number;
  limit?: number;
}

export interface ListSegmentsResponse {
  items: TranscriptSegmentItem[];
  /** Pass as `from_seq` for the next page; null when this page reached the end. */
  next_from_seq: number | null;
}

/** `PATCH /segments/:id` — fixes a mis-recognised segment (US-24). Does NOT re-run the pipeline by itself. */
export interface UpdateSegmentRequest {
  text: string;
}
