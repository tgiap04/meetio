import { useEffect, useRef } from 'react';

/** Defensive cap, well above what any real transcript needs (a 2h meeting is
 *  ~3600 segments = 18 pages of 200) — guards against a runaway fetch loop
 *  if `hasNextPage` somehow never settles to `false`. */
const MAX_AUTO_FETCHED_PAGES = 50;

export interface UseFetchAllPagesForSearchOptions {
  hasQuery: boolean;
  hasMatches: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  /** Resets the per-search fetch counter when the search term changes. */
  searchKey: string;
}

/**
 * Keeps calling `fetchNextPage` while a search term has zero matches in the
 * pages already loaded and more pages remain (US-23 in-transcript search).
 * `FlatList.onEndReached` alone never fires for a `data={[]}` list — there is
 * no scrollable content to reach the end of — so a search over a long
 * meeting would otherwise report "no results" without ever having looked
 * past the first loaded page(s).
 *
 * Returns whether this auto-fetch is currently in progress, so the caller can
 * show a "searching the rest of the transcript" indicator instead of a flat
 * "no results" while it's still looking.
 */
export function useFetchAllPagesForSearch({
  hasQuery,
  hasMatches,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  searchKey,
}: UseFetchAllPagesForSearchOptions): boolean {
  const fetchedCountRef = useRef(0);

  useEffect(() => {
    fetchedCountRef.current = 0;
  }, [searchKey]);

  const isSearchingAllPages = hasQuery && !hasMatches && hasNextPage;

  useEffect(() => {
    if (isSearchingAllPages && !isFetchingNextPage && fetchedCountRef.current < MAX_AUTO_FETCHED_PAGES) {
      fetchedCountRef.current += 1;
      fetchNextPage();
    }
  }, [isSearchingAllPages, isFetchingNextPage, fetchNextPage]);

  return isSearchingAllPages;
}
