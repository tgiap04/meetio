import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateSegmentRequest } from '@meetio/shared';
import { updateSegment } from '../api/meetings';
import { segmentsQueryKey } from './use-segments-query';
import { meetingQueryKey } from './use-meeting-detail-query';

/** Fixes a mis-recognised segment (US-24). Rejects with 409 while the meeting is recording/paused/processing. */
export function useUpdateSegmentMutation(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSegmentRequest }) => updateSegment(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: segmentsQueryKey(meetingId) });
      // `has_unprocessed_edits` flips server-side the moment this save lands
      // — invalidate the cached meeting detail explicitly rather than relying
      // on TanStack Query's default refetch-on-mount to happen to cover it
      // (e.g. if transcript were ever presented as a modal over detail
      // instead of a separate route, detail wouldn't remount to pick it up).
      queryClient.invalidateQueries({ queryKey: meetingQueryKey(meetingId) });
    },
  });
}
