import { useQuery } from '@tanstack/react-query';
import { listEntities } from '../api/entities';

/** Small and non-paged on purpose — this backs an autocomplete dropdown for
 *  the global Q&A entity filter (US-39), not a browsable list (that's
 *  `useInfiniteEntitiesQuery`). */
const ENTITY_SEARCH_LIMIT = 10;

export function entitySearchQueryKey(q: string) {
  return ['entity-search', q] as const;
}

/** `GET /entities?q=` — enabled only once the (already debounced) text is
 *  non-empty, so an empty filter query never fires. */
export function useEntitySearchQuery(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: entitySearchQueryKey(trimmed),
    queryFn: () => listEntities({ q: trimmed, limit: ENTITY_SEARCH_LIMIT }),
    enabled: trimmed.length > 0,
  });
}
