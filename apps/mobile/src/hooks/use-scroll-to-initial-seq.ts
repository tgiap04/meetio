import { useEffect, useRef, type RefObject } from 'react';
import type { FlatList } from 'react-native';
import type { TranscriptSegmentItem } from '@meetio/shared';

/**
 * Scrolls the transcript's `FlatList` to the segment matching `initialSeq`
 * the moment it appears in `segments` (Search tab → transcript jump, US-22).
 * Jumps at most once per screen instance — after that, the user's own
 * scrolling and search take over.
 */
export function useScrollToInitialSeq(
  segments: TranscriptSegmentItem[],
  initialSeq: number | undefined,
  listRef: RefObject<FlatList<TranscriptSegmentItem> | null>,
): void {
  const hasJumpedRef = useRef(false);

  useEffect(() => {
    if (initialSeq === undefined || hasJumpedRef.current) {
      return;
    }
    const index = segments.findIndex((segment) => segment.seq === initialSeq);
    if (index >= 0) {
      hasJumpedRef.current = true;
      listRef.current?.scrollToIndex({ animated: false, index });
    }
  }, [initialSeq, segments, listRef]);
}
