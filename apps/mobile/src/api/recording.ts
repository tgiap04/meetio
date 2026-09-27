import type {
  BulkSegmentsResponse,
  CreateMeetingRequest,
  CreateMeetingResponse,
  EndMeetingRequest,
  MeetingStateResponse,
  TranscriptSegmentPayload,
} from '@meetio/shared';
import { apiClient } from './axios-client';

/**
 * The recording-side lifecycle calls (docs/api-spec.md §3–4). Every one of them is safe to replay:
 * `create` is idempotent on the client-generated id, transitions carry the instant the user acted,
 * and `bulk` upserts by (meeting_id, seq).
 */
/** `ownerId`: the user the data was recorded by — the request is refused if another user is signed in. */
export async function createMeeting(ownerId: string, body: CreateMeetingRequest): Promise<CreateMeetingResponse> {
  const { data } = await apiClient.post<CreateMeetingResponse>('/meetings', body, { expectedOwnerId: ownerId });
  return data;
}

export async function transitionMeeting(
  id: string,
  op: 'pause' | 'resume' | 'end',
  body: EndMeetingRequest,
  ownerId?: string,
): Promise<MeetingStateResponse> {
  const { data } = await apiClient.post<MeetingStateResponse>(`/meetings/${id}/${op}`, body, { expectedOwnerId: ownerId });
  return data;
}

/** Up to 1000 segments per call; returns the seqs now durable on the server. */
export async function bulkUpsertSegments(ownerId: string, id: string, segments: TranscriptSegmentPayload[]): Promise<number[]> {
  const { data } = await apiClient.post<BulkSegmentsResponse>(`/meetings/${id}/segments/bulk`, { segments }, { expectedOwnerId: ownerId });
  return data.acked_seqs;
}
