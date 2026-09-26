import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AskGlobalRequest, AskMeetingRequest, AskResponse } from '@meetio/shared';
import {
  askGlobalQuestion,
  askMeetingQuestion,
  deleteGlobalQaHistory,
  deleteMeetingQaHistory,
} from '../api/qa';
import { globalQaHistoryQueryKey, meetingQaHistoryQueryKey } from './use-qa-history-query';

/**
 * Every mutation on Q&A threads (US-35→37): ask (meeting-scoped and global)
 * and delete history. Ask mutations carry no cache side effect of their own —
 * `useQaThread` appends the confirmed question/answer pair to local state
 * directly from the mutation's response, so the composer never waits on a
 * history refetch round-trip. Delete invalidates its own thread's history so
 * the next fetch (post-confirmation, via `useQaThread.deleteHistory`) sees it
 * genuinely empty.
 */
export function useAskMeetingQuestionMutation(meetingId: string) {
  return useMutation({
    mutationFn: (body: AskMeetingRequest): Promise<AskResponse> => askMeetingQuestion(meetingId, body),
  });
}

export function useDeleteMeetingQaHistoryMutation(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteMeetingQaHistory(meetingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meetingQaHistoryQueryKey(meetingId) }),
  });
}

export function useAskGlobalQuestionMutation() {
  return useMutation({
    mutationFn: (body: AskGlobalRequest): Promise<AskResponse> => askGlobalQuestion(body),
  });
}

export function useDeleteGlobalQaHistoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteGlobalQaHistory(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: globalQaHistoryQueryKey() }),
  });
}
