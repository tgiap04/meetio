import { useQuery } from '@tanstack/react-query';
import { getEntity } from '../api/entities';

export function entityDetailQueryKey(id: string) {
  return ['entity', id] as const;
}

/** `GET /entities/:id` — the entity-detail screen (US-38/39/40). */
export function useEntityDetailQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: entityDetailQueryKey(id),
    queryFn: () => getEntity(id),
    enabled: enabled && id.length > 0,
  });
}
