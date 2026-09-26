import { useInfiniteQuery } from '@tanstack/react-query';
import { listSegments } from '../api/meetings';

/** `initialFromSeq` is folded into the key: jumping into the same meeting at
 *  a different starting seq (Search tab → Transcript result, US-22) must not
 *  reuse a page cached from a different starting point. */
export function segmentsQueryKey(meetingId: string, initialFromSeq: number | null = null) {
  return ['segments', meetingId, initialFromSeq] as const;
}

/** One page of transcript segments. Kept well under a typical ~3600-segment
 *  2h meeting so the transcript screen never has to hold more than a few
 *  pages resident while the list virtualizes the rest. */
export const SEGMENTS_PAGE_SIZE = 200;

/**
 * Screen 09's real data source, paged by `next_from_seq` (US-23).
 *
 * `initialFromSeq` lets the Search tab open a transcript scrolled straight to
 * a semantic match (US-22): `from_seq` is inclusive (api-spec §4), so the
 * first page fetched here starts exactly at that segment instead of at the
 * top of the transcript.
 */
export function useInfiniteSegmentsQuery(meetingId: string | undefined, initialFromSeq: number | null = null) {
  return useInfiniteQuery({
    queryKey: segmentsQueryKey(meetingId ?? '', initialFromSeq),
    queryFn: ({ pageParam }) =>
      listSegments(meetingId as string, { from_seq: pageParam ?? undefined, limit: SEGMENTS_PAGE_SIZE }),
    initialPageParam: initialFromSeq,
    getNextPageParam: (lastPage) => lastPage.next_from_seq,
    enabled: Boolean(meetingId),
  });
}
