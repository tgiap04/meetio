import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { askGlobalQuestion, askMeetingQuestion, deleteGlobalQaHistory, deleteMeetingQaHistory } from '../api/qa';
import {
  useAskGlobalQuestionMutation,
  useAskMeetingQuestionMutation,
  useDeleteGlobalQaHistoryMutation,
  useDeleteMeetingQaHistoryMutation,
} from './use-qa-mutations';

jest.mock('../api/qa', () => ({
  askMeetingQuestion: jest.fn(),
  deleteMeetingQaHistory: jest.fn(),
  askGlobalQuestion: jest.fn(),
  deleteGlobalQaHistory: jest.fn(),
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

describe('qa mutation hooks', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
  });

  it('asks a meeting-scoped question, carrying no cache side effect of its own', async () => {
    (askMeetingQuestion as jest.Mock).mockResolvedValue({ question: { id: 'q1' }, answer: { id: 'a1' } });
    const { getLatest, invalidateSpy } = render(() => useAskMeetingQuestionMutation('m1'));

    await act(async () => {
      await getLatest().mutateAsync({ question: 'Ai phụ trách API?' });
    });

    expect(askMeetingQuestion).toHaveBeenCalledWith('m1', { question: 'Ai phụ trách API?' });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('propagates a rejected ask without swallowing the error', async () => {
    (askMeetingQuestion as jest.Mock).mockRejectedValue(new Error('MEETING_NOT_READY'));
    const { getLatest } = render(() => useAskMeetingQuestionMutation('m1'));

    await expect(
      act(async () => {
        await getLatest().mutateAsync({ question: 'x' });
      }),
    ).rejects.toThrow('MEETING_NOT_READY');
  });

  it('deletes meeting Q&A history and invalidates that meeting thread', async () => {
    (deleteMeetingQaHistory as jest.Mock).mockResolvedValue(undefined);
    const { getLatest, invalidateSpy } = render(() => useDeleteMeetingQaHistoryMutation('m1'));

    await act(async () => {
      await getLatest().mutateAsync();
    });

    expect(deleteMeetingQaHistory).toHaveBeenCalledWith('m1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['qa-history', 'meeting', 'm1'] });
  });

  it('asks a global question with its filters', async () => {
    (askGlobalQuestion as jest.Mock).mockResolvedValue({ question: { id: 'q1' }, answer: { id: 'a1' } });
    const { getLatest } = render(() => useAskGlobalQuestionMutation());

    await act(async () => {
      await getLatest().mutateAsync({ question: 'x', entity_id: 'e1' });
    });

    expect(askGlobalQuestion).toHaveBeenCalledWith({ question: 'x', entity_id: 'e1' });
  });

  it('deletes the global Q&A history and invalidates the global thread', async () => {
    (deleteGlobalQaHistory as jest.Mock).mockResolvedValue(undefined);
    const { getLatest, invalidateSpy } = render(() => useDeleteGlobalQaHistoryMutation());

    await act(async () => {
      await getLatest().mutateAsync();
    });

    expect(deleteGlobalQaHistory).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['qa-history', 'global'] });
  });
});
