import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query';
import type { EntityListResponse } from '@meetio/shared';
import { listEntities } from '../api/entities';
import { useInfiniteEntitiesQuery, type EntitiesListFilters } from './use-entities-query';

type Result = UseInfiniteQueryResult<InfiniteData<EntityListResponse>>;

/** No `@testing-library/react-native` in this repo — same probe pattern as
 *  `use-minimum-splash-delay.test.ts` and `use-search-query`'s callers. */
function Probe({
  filters,
  enabled,
  onValue,
}: {
  filters: EntitiesListFilters;
  enabled?: boolean;
  onValue: (value: Result) => void;
}) {
  onValue(useInfiniteEntitiesQuery(filters, enabled));
  return null;
}

jest.mock('../api/entities', () => ({
  listEntities: jest.fn(),
}));

const mockedListEntities = listEntities as jest.Mock;

function render(filters: EntitiesListFilters, enabled?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest!: Result;
  act(() => {
    TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe enabled={enabled} filters={filters} onValue={(value) => (latest = value)} />
      </QueryClientProvider>,
    );
  });
  return () => latest;
}

/**
 * React Query's `notifyManager` batches updates via `setTimeout`, not a bare
 * microtask — a couple of `await Promise.resolve()` ticks settle a plain
 * promise but not this, so this polls with a real (short) timer instead.
 */
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

describe('useInfiniteEntitiesQuery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches page one with the filters and page size', async () => {
    mockedListEntities.mockResolvedValue({ items: [{ id: 'e1' }], next_offset: null });
    const getLatest = render({ type: 'person', q: 'an' });

    await flush(getLatest);

    expect(mockedListEntities).toHaveBeenCalledWith({ type: 'person', q: 'an', limit: 20, offset: 0 });
    expect(getLatest().data?.pages[0].items).toEqual([{ id: 'e1' }]);
  });

  it('pages forward using next_offset', async () => {
    mockedListEntities
      .mockResolvedValueOnce({ items: [{ id: 'e1' }], next_offset: 20 })
      .mockResolvedValueOnce({ items: [{ id: 'e2' }], next_offset: null });
    const getLatest = render({});

    await flush(getLatest);
    await act(async () => {
      await getLatest().fetchNextPage();
    });

    expect(mockedListEntities).toHaveBeenCalledTimes(2);
    expect(mockedListEntities).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
  });

  it('does not fetch when disabled', async () => {
    const getLatest = render({}, false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(getLatest().isPending).toBe(true);
    expect(mockedListEntities).not.toHaveBeenCalled();
  });

  it('surfaces a rejected request as isError', async () => {
    mockedListEntities.mockRejectedValue(new Error('boom'));
    const getLatest = render({});

    await flush(getLatest);

    expect(getLatest().isError).toBe(true);
  });
});
