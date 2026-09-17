import type { MeetingStatus } from '../enums/meeting-status';
import type { ProcessingStep } from '../enums/processing-step';
import type { ApiErrorCode } from '../enums/api-error-code';

/**
 * WebSocket payloads for the `/meeting-room` namespace.
 * Source of truth: docs/api-spec.md §8 (WebSocket). This file is the ONLY authoritative
 * naming for these events — do not reintroduce the superseded `new_transcript_chunk` /
 * `translated_chunk` / `send_transcript` / `receive_translation` names.
 */

// ---- Client -> Server -----------------------------------------------------

export interface JoinMeetingPayload {
  meeting_id: string;
}

export interface TranscriptSegmentPayload {
  seq: number;
  text: string;
  started_at_ms: number;
  ended_at_ms: number;
  speaker_label?: string;
  gap_before_ms?: number;
}

export interface LeaveMeetingPayload {
  meeting_id: string;
}

// ---- Server -> Client -------------------------------------------------------

/** Emitted only after the segment has been durably persisted to PostgreSQL. */
export interface SegmentAckPayload {
  seq: number;
}

/** Emitted only when translation is enabled for the meeting. */
export interface SegmentTranslatedPayload {
  seq: number;
  translated_text: string;
  translated_to: string;
}

/** Client keeps the segment queued locally and retries on receipt. */
export interface SegmentErrorPayload {
  seq: number;
  code: ApiErrorCode;
  message: string;
}

export interface ProcessingStatusPayload {
  meeting_id: string;
  status: MeetingStatus;
  step?: ProcessingStep;
  progress?: number;
}

export interface MeetingReadyPayload {
  meeting_id: string;
}
