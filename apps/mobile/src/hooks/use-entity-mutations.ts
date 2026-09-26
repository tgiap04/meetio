import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MergeEntitiesRequest, UpdateEntityRequest } from '@meetio/shared';
import {
  deleteEntity,
  mergeEntities,
  rejectMergeSuggestion,
  undoMerge,
  updateEntity,
} from '../api/entities';
import { MERGE_SUGGESTIONS_QUERY_KEY } from './use-merge-suggestions-query';

/**
 * Every mutation on the knowledge graph (US-38→41): edit, delete, merge,
 * undo a merge, reject a suggestion. Each invalidates the caches its own
 * change can make stale — the entity list, any open entity detail, the
 * merge-suggestions list, and (merge/undo only) the meeting-graph views that
 * cite the affected entities, per the task's invalidation requirement.
 */
function useInvalidateGraphCaches() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['entities'] });
    queryClient.invalidateQueries({ queryKey: ['entity'] });
    queryClient.invalidateQueries({ queryKey: MERGE_SUGGESTIONS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['meeting-graph'] });
  };
}

export function useUpdateEntityMutation(id: string) {
  const invalidate = useInvalidateGraphCaches();
  return useMutation({
    mutationFn: (body: UpdateEntityRequest) => updateEntity(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteEntityMutation() {
  const invalidate = useInvalidateGraphCaches();
  return useMutation({
    mutationFn: (id: string) => deleteEntity(id),
    onSuccess: invalidate,
  });
}

export function useMergeEntitiesMutation() {
  const invalidate = useInvalidateGraphCaches();
  return useMutation({
    mutationFn: (body: MergeEntitiesRequest) => mergeEntities(body),
    onSuccess: invalidate,
  });
}

export function useUndoMergeMutation() {
  const invalidate = useInvalidateGraphCaches();
  return useMutation({
    mutationFn: (mergeId: string) => undoMerge(mergeId),
    onSuccess: invalidate,
  });
}

export function useRejectMergeSuggestionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) => rejectMergeSuggestion(suggestionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MERGE_SUGGESTIONS_QUERY_KEY }),
  });
}
