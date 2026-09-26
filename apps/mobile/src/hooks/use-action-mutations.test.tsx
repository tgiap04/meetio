import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { createActionItem, deleteActionItem, updateActionItem } from '../api/actions';
import {
  useCreateActionItemMutation,
  useDeleteActionItemMutation,
  useUpdateActionItemMutation,
} from './use-action-mutations';

jest.mock('../api/actions', () => ({
  createActionItem: jest.fn(),
  deleteActionItem: jest.fn(),
  updateActionItem: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic probe over any mutation hook's result shape
function Probe({ useHook, onValue }: { useHook: () => UseMutationResult<any, any, any>; onValue: (v: any) => void }) {
  onValue(useHook());
  return null;
}

let activeRenderer: TestRenderer.ReactTestRenderer | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
function render(useHook: () => UseMutationResult<any, any, any>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  let latest!: UseMutationResult<any, any, any>;
  act(() => {
    activeRenderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe onValue={(value) => (latest = value)} useHook={useHook} />
      </QueryClientProvider>,
    );
  });
  return { getLatest: () => latest, invalidateSpy };
}

describe('action item mutation hooks', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
  });

  it('create: posts to the meeting-scoped endpoint and invalidates every dependent cache', async () => {
    (createActionItem as jest.Mock).mockResolvedValue({ id: 'a1', meeting_id: 'm1' });
    const { getLatest, invalidateSpy } = render(() => useCreateActionItemMutation('m1'));

    await act(async () => {
      await getLatest().mutateAsync({ content: 'Gửi báo cáo' });
    });

    expect(createActionItem).toHaveBeenCalledWith('m1', { content: 'Gửi báo cáo' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['meeting', 'm1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['meeting-actions', 'm1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['actions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['action-filters'] });
  });

  it('update: reads the meeting id off the response, not the request', async () => {
    (updateActionItem as jest.Mock).mockResolvedValue({ id: 'a1', meeting_id: 'm2', status: 'done' });
    const { getLatest, invalidateSpy } = render(() => useUpdateActionItemMutation());

    await act(async () => {
      await getLatest().mutateAsync({ id: 'a1', body: { status: 'done' } });
    });

    expect(updateActionItem).toHaveBeenCalledWith('a1', { status: 'done' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['meeting', 'm2'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['meeting-actions', 'm2'] });
  });

  it('update: propagates a rejected mutation without swallowing the error', async () => {
    (updateActionItem as jest.Mock).mockRejectedValue(new Error('cannot update'));
    const { getLatest } = render(() => useUpdateActionItemMutation());

    await expect(
      act(async () => {
        await getLatest().mutateAsync({ id: 'a1', body: { status: 'done' } });
      }),
    ).rejects.toThrow('cannot update');
  });

  it('delete: takes the meeting id from the mutation variables since DELETE returns no body', async () => {
    (deleteActionItem as jest.Mock).mockResolvedValue(undefined);
    const { getLatest, invalidateSpy } = render(() => useDeleteActionItemMutation());

    await act(async () => {
      await getLatest().mutateAsync({ id: 'a1', meetingId: 'm3' });
    });

    expect(deleteActionItem).toHaveBeenCalledWith('a1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['meeting', 'm3'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['meeting-actions', 'm3'] });
  });
});
