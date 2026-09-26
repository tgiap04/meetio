import type { RefObject } from 'react';

/** The shape RN's `FlatList` passes to `onScrollToIndexFailed`. */
export interface ScrollToIndexFailedInfo {
  averageItemLength: number;
  highestMeasuredFrameIndex: number;
  index: number;
}

/** Only the one `FlatList` method this needs — kept minimal (rather than
 *  `FlatList<T>`) so this stays usable regardless of the list's item type,
 *  without fighting `FlatList<T>`'s generic variance. */
export interface ScrollableList {
  scrollToOffset(params: { offset: number; animated?: boolean }): void;
}

/**
 * `onScrollToIndexFailed` handler for a `FlatList` with no `getItemLayout`
 * (variable-height rows): a jump to an index past what's been measured
 * throws instead of scrolling (`VirtualizedList.scrollToIndex`) unless this
 * is supplied. Approximates the target offset from the reported average row
 * height — close enough to land the index in view, where the next
 * measurement pass corrects the rest.
 */
export function createScrollToIndexFallback(
  listRef: RefObject<ScrollableList | null>,
): (info: ScrollToIndexFailedInfo) => void {
  return (info) => {
    listRef.current?.scrollToOffset({
      animated: false,
      offset: info.averageItemLength * info.index,
    });
  };
}
