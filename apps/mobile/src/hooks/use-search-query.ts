import { useInfiniteQuery } from '@tanstack/react-query';
import { searchTranscripts } from '../api/search';

export const SEARCH_RESULTS_PAGE_SIZE = 20;

export function searchQueryKey(q: string) {
  return ['search', q] as const;
}

/**
 * The Search tab's Transcript section (US-22), paged by `next_offset` off
 * `GET /search`. Every call costs a Gemini embedding lookup and the endpoint
 * is rate-limited (60/min/user), so the caller MUST gate `enabled` on a
 * debounced, non-trivial query rather than firing on every keystroke.
 */
export function useInfiniteSearchQuery(q: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: searchQueryKey(q),
    queryFn: ({ pageParam }) =>
      searchTranscripts({ q, limit: SEARCH_RESULTS_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset,
    enabled,
  });
}
