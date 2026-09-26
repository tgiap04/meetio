import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CreateActionItemRequest, MeetingActionItem, UpdateActionItemRequest } from '@meetio/shared';
import { createActionItem, deleteActionItem, updateActionItem } from '../api/actions';
import { meetingQueryKey } from './use-meeting-detail-query';
import { meetingActionsQueryKey } from './use-meeting-actions-query';
import { ACTIONS_LIST_QUERY_KEY } from './use-actions-list-query';
import { ACTION_FILTERS_QUERY_KEY } from './use-action-filters-query';

/**
 * Every mutation on action items (US-32→34): add, edit/toggle, delete. Each
 * invalidates every cache its own change can make stale — the owning
 * meeting's detail and its action-items tab, the cross-meeting "Việc cần
 * làm" list, and `/actions/filters` (an edit can change `open_total`, whose
 * assignee has open items, and whose meeting does).
 */
function invalidateActionCaches(queryClient: QueryClient, meetingId: string) {
  queryClient.invalidateQueries({ queryKey: meetingQueryKey(meetingId) });
  queryClient.invalidateQueries({ queryKey: meetingActionsQueryKey(meetingId) });
  queryClient.invalidateQueries({ queryKey: ACTIONS_LIST_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ACTION_FILTERS_QUERY_KEY });
}

/** Manual "Thêm việc" (US-32). */
export function useCreateActionItemMutation(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateActionItemRequest) => createActionItem(meetingId, body),
    onSuccess: () => invalidateActionCaches(queryClient, meetingId),
  });
}

/**
 * Tick-toggle and the edit sheet both go through this one PATCH. The
 * response carries `meeting_id`, so the caller never has to pass it in
 * separately just to know which caches to invalidate.
 */
export function useUpdateActionItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateActionItemRequest }) => updateActionItem(id, body),
    onSuccess: (result: MeetingActionItem) => invalidateActionCaches(queryClient, result.meeting_id),
  });
}

/** `DELETE /actions/:id` returns no body, so the meeting id travels with the
 *  mutation variables instead of the response. */
export function useDeleteActionItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; meetingId: string }) => deleteActionItem(id),
    onSuccess: (_data, variables) => invalidateActionCaches(queryClient, variables.meetingId),
  });
}
