import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReindexMeetingRequest, UpdateMeetingRequest } from '@meetio/shared';
import { deleteMeeting, reindexMeeting, updateMeeting } from '../api/meetings';
import { MEETINGS_QUERY_KEY } from './use-meetings-query';
import { meetingQueryKey } from './use-meeting-detail-query';

/** Inline title edit with autosave (US-25) — a blank title reverts server-side. */
export function useUpdateMeetingMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeetingRequest) => updateMeeting(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meetingQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: MEETINGS_QUERY_KEY });
    },
  });
}

/** Physical delete (US-26). Called only after the client-side undo window elapses. */
export function useDeleteMeetingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMeeting(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEETINGS_QUERY_KEY }),
  });
}

/** Re-runs the AI pipeline after a transcript edit (US-24) or a manual retry after `failed` (US-28). */
export function useReindexMeetingMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReindexMeetingRequest) => reindexMeeting(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meetingQueryKey(id) }),
  });
}
