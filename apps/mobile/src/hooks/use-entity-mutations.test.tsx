import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import {
  deleteEntity,
  mergeEntities,
  rejectMergeSuggestion,
  undoMerge,
  updateEntity,
} from '../api/entities';
import {
  useDeleteEntityMutation,
  useMergeEntitiesMutation,
  useRejectMergeSuggestionMutation,
  useUndoMergeMutation,
  useUpdateEntityMutation,
} from './use-entity-mutations';

jest.mock('../api/entities', () => ({
  updateEntity: jest.fn(),
  deleteEntity: jest.fn(),
  mergeEntities: jest.fn(),
  undoMerge: jest.fn(),
  rejectMergeSuggestion: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic probe over any mutation hook's result shape
function Probe({ useHook, onValue }: { useHook: () => UseMutationResult<any, any, any>; onValue: (v: any) => void }) {
  onValue(useHook());
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic probe over any mutation hook's result shape
function render(useHook: () => UseMutationResult<any, any, any>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  let latest!: UseMutationResult<any, any, any>;
  act(() => {
    TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe onValue={(value) => (latest = value)} useHook={useHook} />
      </QueryClientProvider>,
    );
  });
  return { getLatest: () => latest, invalidateSpy };
}

describe('entity mutation hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('update: calls the API and invalidates the graph caches on success', async () => {
    (updateEntity as jest.Mock).mockResolvedValue({ id: 'e1', canonical_name: 'Mới' });
    const { getLatest, invalidateSpy } = render(() => useUpdateEntityMutation('e1'));

    await act(async () => {
      await getLatest().mutateAsync({ canonical_name: 'Mới' });
    });

    expect(updateEntity).toHaveBeenCalledWith('e1', { canonical_name: 'Mới' });
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('delete: propagates a rejected mutation without swallowing the error', async () => {
    (deleteEntity as jest.Mock).mockRejectedValue(new Error('cannot delete'));
    const { getLatest } = render(() => useDeleteEntityMutation());

    await expect(
      act(async () => {
        await getLatest().mutateAsync('e1');
      }),
    ).rejects.toThrow('cannot delete');
  });

  it('merge: invalidates caches on success', async () => {
    (mergeEntities as jest.Mock).mockResolvedValue({ entity: { id: 'keep' }, merges: [] });
    const { getLatest, invalidateSpy } = render(() => useMergeEntitiesMutation());

    await act(async () => {
      await getLatest().mutateAsync({ keep_id: 'keep', merge_ids: ['a'] });
    });

    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('undo merge: surfaces a 409 (expired) as a rejected mutation', async () => {
    const expired = Object.assign(new Error('expired'), { response: { status: 409 } });
    (undoMerge as jest.Mock).mockRejectedValue(expired);
    const { getLatest } = render(() => useUndoMergeMutation());

    await expect(
      act(async () => {
        await getLatest().mutateAsync('merge-1');
      }),
    ).rejects.toBe(expired);
  });

  it('reject suggestion: invalidates the suggestions cache on success', async () => {
    (rejectMergeSuggestion as jest.Mock).mockResolvedValue(undefined);
    const { getLatest, invalidateSpy } = render(() => useRejectMergeSuggestionMutation());

    await act(async () => {
      await getLatest().mutateAsync('s1');
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merge-suggestions'] });
  });
});
