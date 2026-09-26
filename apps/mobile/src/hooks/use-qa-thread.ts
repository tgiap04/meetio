import { useState } from 'react';
import { isAxiosError } from 'axios';
import type { ApiErrorEnvelope, AskResponse, QaMessage } from '@meetio/shared';
import { ApiErrorCode } from '@meetio/shared';
import { getErrorMessage } from '../api/error-messages';

/** History side of a thread, in the shape both `use-qa-history-query.ts`
 *  hooks already produce once flattened — kept as its own interface so
 *  `useQaThread` doesn't import `useInfiniteQuery`'s result type directly. */
export interface QaHistoryPageState {
  items: readonly QaMessage[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export interface QaAskMutationLike<TRequest> {
  mutateAsync: (request: TRequest) => Promise<AskResponse>;
  isPending: boolean;
}

export interface QaDeleteMutationLike {
  mutateAsync: () => Promise<void>;
  isPending: boolean;
}

export interface QaPendingTurn {
  question: string;
  status: 'sending' | 'error';
  errorMessage?: string;
}

function isMeetingNotReadyError(error: unknown): boolean {
  return (
    isAxiosError<ApiErrorEnvelope>(error) &&
    error.response?.data?.error?.code === ApiErrorCode.MEETING_NOT_READY
  );
}

/**
 * Shared chat-thread state machine for the meeting-scoped and global Q&A
 * screens (US-35→37): renders history oldest-first, sends a question with an
 * optimistic user turn, appends the confirmed question/answer pair on
 * success, and treats MEETING_NOT_READY as a thread-blocking state rather
 * than a retryable bubble error — every other failure (429/503/etc.) stays a
 * retryable error on the pending turn itself.
 *
 * Generic over the request shape so one hook serves both
 * `AskMeetingRequest` (`{ question }`) and `AskGlobalRequest` (adds the
 * optional filters) without duplicating the send/retry/delete logic.
 */
export function useQaThread<TRequest>(
  history: QaHistoryPageState,
  askMutation: QaAskMutationLike<TRequest>,
  deleteMutation: QaDeleteMutationLike,
) {
  const [sentMessages, setSentMessages] = useState<QaMessage[]>([]);
  const [pending, setPending] = useState<QaPendingTurn | null>(null);
  const [lastRequest, setLastRequest] = useState<TRequest | null>(null);
  const [meetingNotReady, setMeetingNotReady] = useState(false);

  // A history refetch (e.g. the app coming back to the foreground) already contains the turns sent
  // here — show each message once.
  const known = new Set(history.items.map((m) => m.id));
  const items: QaMessage[] = [...history.items, ...sentMessages.filter((m) => !known.has(m.id))];

  function send(request: TRequest, questionText: string) {
    setLastRequest(request);
    setMeetingNotReady(false);
    setPending({ question: questionText, status: 'sending' });
    askMutation
      .mutateAsync(request)
      .then((response) => {
        setSentMessages((prev) => [...prev, response.question, response.answer]);
        setPending(null);
      })
      .catch((error: unknown) => {
        if (isMeetingNotReadyError(error)) {
          setMeetingNotReady(true);
          setPending(null);
          return;
        }
        setPending({ question: questionText, status: 'error', errorMessage: getErrorMessage(error) });
      });
  }

  function retry() {
    if (lastRequest !== null && pending?.status === 'error') {
      send(lastRequest, pending.question);
    }
  }

  function deleteHistory(): Promise<void> {
    return deleteMutation.mutateAsync().then(() => {
      setSentMessages([]);
      setPending(null);
      setMeetingNotReady(false);
      history.refetch();
    });
  }

  return {
    items,
    pending,
    isSending: askMutation.isPending,
    meetingNotReady,
    send,
    retry,
    deleteHistory,
    deletingHistory: deleteMutation.isPending,
  };
}
