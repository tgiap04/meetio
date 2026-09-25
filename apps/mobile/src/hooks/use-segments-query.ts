import { useInfiniteQuery } from '@tanstack/react-query';
import { listSegments } from '../api/meetings';

export function segmentsQueryKey(meetingId: string) {
  return ['segments', meetingId] as const;
}

/** One page of transcript segments. Kept well under a typical ~3600-segment
 *  2h meeting so the transcript screen never has to hold more than a few
 *  pages resident while the list virtualizes the rest. */
export const SEGMENTS_PAGE_SIZE = 200;

/** Screen 09's real data source, paged by `next_from_seq` (US-23). */
export function useInfiniteSegmentsQuery(meetingId: string | undefined) {
  return useInfiniteQuery({
    queryKey: segmentsQueryKey(meetingId ?? ''),
    queryFn: ({ pageParam }) =>
      listSegments(meetingId as string, { from_seq: pageParam ?? undefined, limit: SEGMENTS_PAGE_SIZE }),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.next_from_seq,
    enabled: Boolean(meetingId),
  });
}
