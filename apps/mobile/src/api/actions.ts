import type {
  ActionFiltersResponse,
  ActionListQuery,
  ActionListResponse,
  CreateActionItemRequest,
  MeetingActionItem,
  UpdateActionItemRequest,
} from '@meetio/shared';
import { apiClient } from './axios-client';

/**
 * `/meetings/:id/actions`, `/actions*` calls (US-32→34) per
 * `packages/shared/src/actions/actions.types.ts` and docs/api-spec.md §5.
 * Types come straight from `@meetio/shared` — nothing here redeclares the
 * wire shape.
 */

export interface MeetingActionsResponse {
  items: MeetingActionItem[];
}

/** `GET /meetings/:id/actions` — open first, done last. */
export async function getMeetingActions(meetingId: string): Promise<MeetingActionsResponse> {
  const { data } = await apiClient.get<MeetingActionsResponse>(`/meetings/${meetingId}/actions`);
  return data;
}

/** `GET /actions?status=&assignee_entity_id=&meeting_id=&limit=&offset=` (US-34). */
export async function listActions(query: ActionListQuery = {}): Promise<ActionListResponse> {
  const { data } = await apiClient.get<ActionListResponse>('/actions', { params: query });
  return data;
}

/** `GET /actions/filters` — the exact open count (Home row) plus the "Việc
 *  cần làm" screen's assignee and meeting filter chips, in one call. */
export async function getActionFilters(): Promise<ActionFiltersResponse> {
  const { data } = await apiClient.get<ActionFiltersResponse>('/actions/filters');
  return data;
}

/** `POST /meetings/:id/actions` — a task the AI missed (US-32). */
export async function createActionItem(
  meetingId: string,
  body: CreateActionItemRequest,
): Promise<MeetingActionItem> {
  const { data } = await apiClient.post<MeetingActionItem>(`/meetings/${meetingId}/actions`, body);
  return data;
}

/** `PATCH /actions/:id` — any field change marks the item user-edited. */
export async function updateActionItem(id: string, body: UpdateActionItemRequest): Promise<MeetingActionItem> {
  const { data } = await apiClient.patch<MeetingActionItem>(`/actions/${id}`, body);
  return data;
}

export async function deleteActionItem(id: string): Promise<void> {
  await apiClient.delete(`/actions/${id}`);
}
