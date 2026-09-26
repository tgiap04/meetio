import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import type { EntityListResponse } from '@meetio/shared';
import { listEntities } from '../api/entities';
import { useEntitySearchQuery } from './use-entity-search-query';

jest.mock('../api/entities', () => ({
  listEntities: jest.fn(),
}));

const mockedListEntities = listEntities as jest.Mock;

function Probe({ q, onValue }: { q: string; onValue: (v: UseQueryResult<EntityListResponse>) => void }) {
  onValue(useEntitySearchQuery(q));
  return null;
}

let activeRenderer: TestRenderer.ReactTestRenderer | undefined;

function render(q: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest!: UseQueryResult<EntityListResponse>;
  act(() => {
    activeRenderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe onValue={(value) => (latest = value)} q={q} />
      </QueryClientProvider>,
    );
  });
  return () => latest;
}

async function flush(getLatest: () => { isSuccess: boolean; isError: boolean; fetchStatus: string }) {
  for (let i = 0; i < 30; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const latest = getLatest();
    if (latest.isSuccess || latest.isError) {
      return;
    }
  }
}

describe('useEntitySearchQuery', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
  });

  it('searches with the trimmed query and a capped limit', async () => {
    mockedListEntities.mockResolvedValue({ items: [{ id: 'e1', canonical_name: 'Bình' }], next_offset: null });
    const getLatest = render('  Bình  ');

    await flush(getLatest);

    expect(mockedListEntities).toHaveBeenCalledWith({ q: 'Bình', limit: 10 });
  });

  it('stays disabled for a blank query', () => {
    const getLatest = render('   ');
    expect(getLatest().fetchStatus).toBe('idle');
    expect(mockedListEntities).not.toHaveBeenCalled();
  });
});
