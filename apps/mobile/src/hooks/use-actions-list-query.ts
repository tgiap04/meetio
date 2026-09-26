import { useInfiniteQuery } from '@tanstack/react-query';
import type { ActionStatus } from '@meetio/shared';
import { listActions } from '../api/actions';

export const ACTIONS_PAGE_SIZE = 20;

export const ACTIONS_LIST_QUERY_KEY = ['actions'] as const;

export interface ActionsListFilters {
  status?: ActionStatus;
  assignee_entity_id?: string;
  meeting_id?: string;
}

export function actionsListQueryKey(filters: ActionsListFilters) {
  return [...ACTIONS_LIST_QUERY_KEY, filters] as const;
}

/** Paged `GET /actions` (US-34), the "Việc cần làm" screen's data source.
 *  `filters` is part of the query key so switching a chip starts a fresh
 *  page-1 cache entry rather than mixing pages from two different filters. */
export function useInfiniteActionsListQuery(filters: ActionsListFilters) {
  return useInfiniteQuery({
    queryKey: actionsListQueryKey(filters),
    queryFn: ({ pageParam }) => listActions({ ...filters, limit: ACTIONS_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset,
  });
}
