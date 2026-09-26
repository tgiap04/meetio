import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import type { ActionFiltersResponse } from '@meetio/shared';
import { getActionFilters } from '../api/actions';
import { useActionFiltersQuery } from './use-action-filters-query';

jest.mock('../api/actions', () => ({
  getActionFilters: jest.fn(),
}));

const mockedGetActionFilters = getActionFilters as jest.Mock;

function Probe({ onValue }: { onValue: (v: UseQueryResult<ActionFiltersResponse>) => void }) {
  onValue(useActionFiltersQuery());
  return null;
}

let activeRenderer: TestRenderer.ReactTestRenderer | undefined;

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest!: UseQueryResult<ActionFiltersResponse>;
  act(() => {
    activeRenderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe onValue={(value) => (latest = value)} />
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

describe('useActionFiltersQuery', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
  });

  it('fetches the action filters', async () => {
    mockedGetActionFilters.mockResolvedValue({
      open_total: 5,
      assignees: [{ id: 'e1', canonical_name: 'Bình', open_count: 2 }],
      meetings: [{ id: 'm1', title: 'Sprint Review', started_at: null, open_count: 3 }],
    });
    const getLatest = render();
    await flush(getLatest);
    expect(mockedGetActionFilters).toHaveBeenCalledTimes(1);
    expect(getLatest().data?.open_total).toBe(5);
  });

  it('surfaces a rejected request as isError', async () => {
    mockedGetActionFilters.mockRejectedValue(new Error('boom'));
    const getLatest = render();
    await flush(getLatest);
    expect(getLatest().isError).toBe(true);
  });
});
