import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { listMergeSuggestions } from '../api/entities';
import { useMergeSuggestionsQuery } from './use-merge-suggestions-query';

jest.mock('../api/entities', () => ({
  listMergeSuggestions: jest.fn(),
}));

const mockedList = listMergeSuggestions as jest.Mock;

function Probe({ enabled, onValue }: { enabled?: boolean; onValue: (value: UseQueryResult) => void }) {
  onValue(useMergeSuggestionsQuery(enabled) as unknown as UseQueryResult);
  return null;
}

function render(enabled?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest!: UseQueryResult;
  act(() => {
    TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe enabled={enabled} onValue={(value) => (latest = value)} />
      </QueryClientProvider>,
    );
  });
  return () => latest;
}

/** `notifyManager` batches via `setTimeout`, not a bare microtask — poll with
 *  a real timer rather than a couple of `Promise.resolve()` ticks. */
async function flush(getLatest: () => { isSuccess: boolean; isError: boolean }, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const latest = getLatest();
    if (latest.isSuccess || latest.isError) {
      return;
    }
  }
}

describe('useMergeSuggestionsQuery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches the suggestions list', async () => {
    mockedList.mockResolvedValue({ items: [{ id: 's1' }] });
    const getLatest = render();

    await flush(getLatest);

    expect(mockedList).toHaveBeenCalled();
    expect(getLatest().data).toEqual({ items: [{ id: 's1' }] });
  });

  it('does not fetch when disabled', async () => {
    const getLatest = render(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(getLatest().isPending).toBe(true);
    expect(mockedList).not.toHaveBeenCalled();
  });
});
