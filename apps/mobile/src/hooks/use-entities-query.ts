import { useInfiniteQuery } from '@tanstack/react-query';
import { listEntities } from '../api/entities';

export const ENTITIES_PAGE_SIZE = 20;

export interface EntitiesListFilters {
  /** Comma list per the API contract, e.g. `organization,product,other`. */
  type?: string;
  q?: string;
}

export function entitiesQueryKey(filters: EntitiesListFilters) {
  return ['entities', filters] as const;
}

/**
 * Paged `GET /entities` list (US-38), reused by the entity-list screen and
 * the Search tab's Node chip / "Người" group. `filters` is part of the query
 * key so switching type or query text starts a fresh page-1 cache entry.
 */
export function useInfiniteEntitiesQuery(filters: EntitiesListFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: entitiesQueryKey(filters),
    queryFn: ({ pageParam }) =>
      listEntities({ ...filters, limit: ENTITIES_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset,
    enabled,
  });
}
