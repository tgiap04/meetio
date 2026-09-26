import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query';
import type { ActionListResponse } from '@meetio/shared';
import { listActions } from '../api/actions';
import { useInfiniteActionsListQuery, type ActionsListFilters } from './use-actions-list-query';

type Result = UseInfiniteQueryResult<InfiniteData<ActionListResponse>>;

jest.mock('../api/actions', () => ({
  listActions: jest.fn(),
}));

const mockedListActions = listActions as jest.Mock;

function Probe({ filters, onValue }: { filters: ActionsListFilters; onValue: (v: Result) => void }) {
  onValue(useInfiniteActionsListQuery(filters));
  return null;
}

let activeRenderer: TestRenderer.ReactTestRenderer | undefined;

function render(filters: ActionsListFilters) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest!: Result;
  act(() => {
    activeRenderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe filters={filters} onValue={(value) => (latest = value)} />
      </QueryClientProvider>,
    );
  });
  return () => latest;
}

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

describe('useInfiniteActionsListQuery', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
  });

  it('fetches page one with the filters and page size', async () => {
    mockedListActions.mockResolvedValue({ items: [{ id: 'a1' }], next_offset: null });
    const getLatest = render({ status: 'open' });

    await flush(getLatest);

    expect(mockedListActions).toHaveBeenCalledWith({ status: 'open', limit: 20, offset: 0 });
    expect(getLatest().data?.pages[0].items).toEqual([{ id: 'a1' }]);
  });

  it('pages forward using next_offset', async () => {
    mockedListActions
      .mockResolvedValueOnce({ items: [{ id: 'a1' }], next_offset: 20 })
      .mockResolvedValueOnce({ items: [{ id: 'a2' }], next_offset: null });
    const getLatest = render({});

    await flush(getLatest);
    await act(async () => {
      await getLatest().fetchNextPage();
    });

    expect(mockedListActions).toHaveBeenCalledTimes(2);
    expect(mockedListActions).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
  });

  it('surfaces a rejected request as isError', async () => {
    mockedListActions.mockRejectedValue(new Error('boom'));
    const getLatest = render({});

    await flush(getLatest);

    expect(getLatest().isError).toBe(true);
  });
});
