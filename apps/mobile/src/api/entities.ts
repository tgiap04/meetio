import type {
  EntityDetail,
  EntityListQuery,
  EntityListResponse,
  EntityTimelineResponse,
  MeetingGraphResponse,
  MergeEntitiesRequest,
  MergeEntitiesResponse,
  MergeSuggestionsResponse,
  UpdateEntityRequest,
} from '@meetio/shared';
import { apiClient } from './axios-client';

/**
 * Knowledge-graph endpoints (US-38→41) per `packages/shared/src/graph/graph.types.ts`
 * and docs/api-spec.md §7. Types come straight from `@meetio/shared` — nothing
 * here redeclares the wire shape.
 */

export async function listEntities(query: EntityListQuery = {}): Promise<EntityListResponse> {
  const { data } = await apiClient.get<EntityListResponse>('/entities', { params: query });
  return data;
}

export async function getEntity(id: string): Promise<EntityDetail> {
  const { data } = await apiClient.get<EntityDetail>(`/entities/${id}`);
  return data;
}

export interface EntityTimelineQuery {
  limit?: number;
  offset?: number;
}

export async function getEntityTimeline(
  id: string,
  query: EntityTimelineQuery = {},
): Promise<EntityTimelineResponse> {
  const { data } = await apiClient.get<EntityTimelineResponse>(`/entities/${id}/timeline`, {
    params: query,
  });
  return data;
}

export async function updateEntity(id: string, body: UpdateEntityRequest): Promise<EntityDetail> {
  const { data } = await apiClient.patch<EntityDetail>(`/entities/${id}`, body);
  return data;
}

export async function deleteEntity(id: string): Promise<void> {
  await apiClient.delete(`/entities/${id}`);
}

export async function listMergeSuggestions(): Promise<MergeSuggestionsResponse> {
  const { data } = await apiClient.get<MergeSuggestionsResponse>('/entities/merge-suggestions');
  return data;
}

export async function mergeEntities(body: MergeEntitiesRequest): Promise<MergeEntitiesResponse> {
  const { data } = await apiClient.post<MergeEntitiesResponse>('/entities/merge', body);
  return data;
}

/** `POST /entities/merge/:mergeId/undo` — 409 when the 30-day window has
 *  expired or the merge was already undone; callers surface that via
 *  `getErrorMessage`/`error.response.status`. */
export async function undoMerge(mergeId: string): Promise<EntityDetail> {
  const { data } = await apiClient.post<EntityDetail>(`/entities/merge/${mergeId}/undo`);
  return data;
}

export async function rejectMergeSuggestion(suggestionId: string): Promise<void> {
  await apiClient.post(`/entities/merge-suggestions/${suggestionId}/reject`);
}

export async function getMeetingGraph(meetingId: string): Promise<MeetingGraphResponse> {
  const { data } = await apiClient.get<MeetingGraphResponse>(`/meetings/${meetingId}/graph`);
  return data;
}
