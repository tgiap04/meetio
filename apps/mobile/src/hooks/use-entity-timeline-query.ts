import { useInfiniteQuery } from '@tanstack/react-query';
import { getEntityTimeline } from '../api/entities';

export const ENTITY_TIMELINE_PAGE_SIZE = 20;

export function entityTimelineQueryKey(id: string) {
  return ['entity-timeline', id] as const;
}

/** Paged `GET /entities/:id/timeline` (US-39) — oldest meeting first. */
export function useEntityTimelineQuery(id: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: entityTimelineQueryKey(id),
    queryFn: ({ pageParam }) =>
      getEntityTimeline(id, { limit: ENTITY_TIMELINE_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset,
    enabled: enabled && id.length > 0,
  });
}
