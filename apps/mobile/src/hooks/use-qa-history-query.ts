import { useInfiniteQuery } from '@tanstack/react-query';
import type { QaHistoryResponse, QaMessage } from '@meetio/shared';
import { getGlobalQaHistory, getMeetingQaHistory } from '../api/qa';

/** Matches the server default (docs/api-spec.md §6) — kept explicit so a page
 *  boundary in a test doesn't silently depend on that default changing. */
export const QA_HISTORY_PAGE_SIZE = 50;

export function meetingQaHistoryQueryKey(meetingId: string) {
  return ['qa-history', 'meeting', meetingId] as const;
}

export function globalQaHistoryQueryKey() {
  return ['qa-history', 'global'] as const;
}

/**
 * Oldest-first across every page loaded so far. `useInfiniteQuery` appends
 * each `fetchNextPage()` result to the END of `pages`, and each call asks the
 * server for messages OLDER than the last page's oldest (`next_before`) — so
 * `pages` arrives most-recent-page-first. Building the oldest-first list the
 * chat screens want to render means walking `pages` in reverse; each page's
 * own `items` is already oldest-first internally (the contract's own
 * ordering), so it is not reversed itself.
 */
export function flattenQaHistoryPages(pages: readonly QaHistoryResponse[] | undefined): QaMessage[] {
  if (!pages) {
    return [];
  }
  return [...pages].reverse().flatMap((page) => page.items);
}

/** Meeting-scoped Q&A history (US-35/36), paged backward via `next_before`. */
export function useMeetingQaHistoryQuery(meetingId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: meetingQaHistoryQueryKey(meetingId),
    queryFn: ({ pageParam }) =>
      getMeetingQaHistory(meetingId, { before: pageParam, limit: QA_HISTORY_PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_before ?? undefined,
    enabled: enabled && meetingId.length > 0,
  });
}

/** Cross-meeting Q&A history — a single global thread (US-37). */
export function useGlobalQaHistoryQuery(enabled = true) {
  return useInfiniteQuery({
    queryKey: globalQaHistoryQueryKey(),
    queryFn: ({ pageParam }) => getGlobalQaHistory({ before: pageParam, limit: QA_HISTORY_PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_before ?? undefined,
    enabled,
  });
}
