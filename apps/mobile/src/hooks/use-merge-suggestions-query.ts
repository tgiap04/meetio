import { useQuery } from '@tanstack/react-query';
import { listMergeSuggestions } from '../api/entities';

export const MERGE_SUGGESTIONS_QUERY_KEY = ['merge-suggestions'] as const;

/** `GET /entities/merge-suggestions` — the entity-list "Xem đề xuất gộp (N)"
 *  entry point and the merge-review screen (US-41) share this one cache
 *  entry. */
export function useMergeSuggestionsQuery(enabled = true) {
  return useQuery({
    queryKey: MERGE_SUGGESTIONS_QUERY_KEY,
    queryFn: listMergeSuggestions,
    enabled,
  });
}
