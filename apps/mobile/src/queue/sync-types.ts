import type { CreateMeetingRequest, CreateMeetingResponse, EndMeetingRequest, TranscriptSegmentPayload } from '@meetio/shared';

/** A backlog above this goes through `/segments/bulk` — one request instead of hundreds of socket events. */
export const BULK_THRESHOLD = 50;
export const BULK_LIMIT = 1000;
/** Socket segments awaiting their ack at once. */
export const INFLIGHT_WINDOW = 20;
export const RESEND_AFTER_MS = 10_000;

export interface SyncStatus {
  pending: number;
  online: boolean;
}

export interface SyncApi {
  /** Every call names the user whose queued data it carries; it must fail if another user is signed in. */
  createMeeting(ownerId: string, body: CreateMeetingRequest): Promise<CreateMeetingResponse>;
  transitionMeeting(id: string, op: 'pause' | 'resume' | 'end', body: EndMeetingRequest, ownerId: string): Promise<unknown>;
  bulkUpsertSegments(ownerId: string, id: string, segments: TranscriptSegmentPayload[]): Promise<number[]>;
}
