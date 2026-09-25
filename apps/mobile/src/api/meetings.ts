import type {
  ExportMeetingQuery,
  ListMeetingsQuery,
  ListMeetingsResponse,
  ListSegmentsQuery,
  ListSegmentsResponse,
  MeetingDetailResponse,
  MeetingListItem,
  MeetingStateResponse,
  MeetingStatusResponse,
  ReindexMeetingRequest,
  TranscriptSegmentItem,
  UpdateMeetingRequest,
  UpdateSegmentRequest,
} from '@meetio/shared';
import { apiClient } from './axios-client';

/**
 * `/meetings*` and `/segments/:id` calls per docs/api-spec.md §3–4. Types come
 * straight from `@meetio/shared` — nothing here redeclares the wire shape.
 */

export async function listMeetings(query: ListMeetingsQuery = {}): Promise<ListMeetingsResponse> {
  const { data } = await apiClient.get<ListMeetingsResponse>('/meetings', { params: query });
  return data;
}

export async function getMeeting(id: string): Promise<MeetingDetailResponse> {
  const { data } = await apiClient.get<MeetingDetailResponse>(`/meetings/${id}`);
  return data;
}

export async function updateMeeting(
  id: string,
  body: UpdateMeetingRequest,
): Promise<MeetingListItem> {
  const { data } = await apiClient.patch<MeetingListItem>(`/meetings/${id}`, body);
  return data;
}

export async function deleteMeeting(id: string): Promise<void> {
  await apiClient.delete(`/meetings/${id}`);
}

export async function listSegments(
  meetingId: string,
  query: ListSegmentsQuery = {},
): Promise<ListSegmentsResponse> {
  const { data } = await apiClient.get<ListSegmentsResponse>(`/meetings/${meetingId}/segments`, {
    params: query,
  });
  return data;
}

export async function updateSegment(
  id: string,
  body: UpdateSegmentRequest,
): Promise<TranscriptSegmentItem> {
  const { data } = await apiClient.patch<TranscriptSegmentItem>(`/segments/${id}`, body);
  return data;
}

export async function reindexMeeting(
  id: string,
  body: ReindexMeetingRequest,
): Promise<MeetingStateResponse> {
  const { data } = await apiClient.post<MeetingStateResponse>(`/meetings/${id}/reindex`, body);
  return data;
}

export async function getMeetingStatus(id: string): Promise<MeetingStatusResponse> {
  const { data } = await apiClient.get<MeetingStatusResponse>(`/meetings/${id}/status`);
  return data;
}

/** Returns the raw export body — Markdown text or an HTML document, per `query.format`. */
export async function exportMeeting(id: string, query: ExportMeetingQuery): Promise<string> {
  const { data } = await apiClient.get<string>(`/meetings/${id}/export`, {
    params: query,
    responseType: 'text',
    transformResponse: (value: unknown) => value,
  });
  return data;
}
