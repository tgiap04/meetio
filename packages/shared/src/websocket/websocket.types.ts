import type { MeetingStatus } from '../enums/meeting-status';
import type { ProcessingStep } from '../enums/processing-step';
import type { ApiErrorCode } from '../enums/api-error-code';

/**
 * WebSocket payloads for the `/meeting-room` namespace.
 * Source of truth: docs/api-spec.md §8 (WebSocket). This file is the ONLY authoritative
 * naming for these events — do not reintroduce the superseded `new_transcript_chunk` /
 * `translated_chunk` / `send_transcript` / `receive_translation` names.
 */

export const MEETING_ROOM_NAMESPACE = '/meeting-room';

/** Event names — api-spec §8 is the only authoritative list. */
export const WsClientEvent = {
  JOIN_MEETING: 'join_meeting',
  TRANSCRIPT_SEGMENT: 'transcript_segment',
  LEAVE_MEETING: 'leave_meeting',
} as const;

export const WsServerEvent = {
  SEGMENT_ACK: 'segment_ack',
  SEGMENT_TRANSLATED: 'segment_translated',
  SEGMENT_TRANSLATION_FAILED: 'segment_translation_failed',
  SEGMENT_ERROR: 'segment_error',
  PROCESSING_STATUS: 'processing_status',
  MEETING_READY: 'meeting_ready',
} as const;

/**
 * Socket.io acknowledgement for `join_meeting` / `leave_meeting`. api-spec §8
 * gives these events no server reply, so the ack is how a client learns the
 * join was refused (someone else's meeting → MEETING_NOT_FOUND).
 */
export type WsJoinAck = { ok: true } | { ok: false; error: { code: ApiErrorCode; message: string } };

// ---- Client -> Server -----------------------------------------------------

export interface JoinMeetingPayload {
  meeting_id: string;
}

/** No speaker field — US-13 was dropped; the transcript is one continuous stream. */
export interface TranscriptSegmentPayload {
  seq: number;
  text: string;
  started_at_ms: number;
  ended_at_ms: number;
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

/** One segment's translation — also the body of `POST /meetings/:id/segments/:seq/translate`. */
export interface SegmentTranslation {
  seq: number;
  translated_text: string;
  translated_to: string;
}

/**
 * Emitted only when translation is enabled for the meeting. `meeting_id` lets a client on a reused
 * socket drop a late event that belongs to the meeting it just left.
 */
export interface SegmentTranslatedPayload extends SegmentTranslation {
  meeting_id: string;
}

/**
 * Translation of this segment failed after the batch and the single-segment retry.
 * The client offers a manual retry (`POST /meetings/:id/segments/:seq/translate`).
 */
export interface SegmentTranslationFailedPayload {
  meeting_id: string;
  seq: number;
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
