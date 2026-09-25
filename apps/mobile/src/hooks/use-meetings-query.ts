import { useInfiniteQuery } from '@tanstack/react-query';
import type { ListMeetingsQuery } from '@meetio/shared';
import { listMeetings } from '../api/meetings';

export const MEETINGS_QUERY_KEY = ['meetings'] as const;

export type MeetingsListFilters = Omit<ListMeetingsQuery, 'cursor'>;

export function meetingsQueryKey(filters: MeetingsListFilters) {
  return [...MEETINGS_QUERY_KEY, filters] as const;
}

/**
 * The Library tab's page-by-`next_cursor` feed (US-20/21). `filters` (search
 * text, date range, status) form part of the query key so switching a filter
 * starts a fresh cache entry instead of mixing pages fetched under a
 * different filter set.
 */
export function useInfiniteMeetingsQuery(filters: MeetingsListFilters = {}) {
  return useInfiniteQuery({
    queryKey: meetingsQueryKey(filters),
    queryFn: ({ pageParam }) =>
      listMeetings({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });
}
