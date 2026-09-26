import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { getEntity } from '../api/entities';
import { useEntityDetailQuery } from './use-entity-detail-query';

jest.mock('../api/entities', () => ({
  getEntity: jest.fn(),
}));

const mockedGetEntity = getEntity as jest.Mock;

function Probe({
  id,
  enabled,
  onValue,
}: {
  id: string;
  enabled?: boolean;
  onValue: (value: UseQueryResult) => void;
}) {
  onValue(useEntityDetailQuery(id, enabled) as unknown as UseQueryResult);
  return null;
}

function render(id: string, enabled?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest!: UseQueryResult;
  act(() => {
    TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe enabled={enabled} id={id} onValue={(value) => (latest = value)} />
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

describe('useEntityDetailQuery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches the entity by id', async () => {
    mockedGetEntity.mockResolvedValue({ id: 'e1', canonical_name: 'Nguyễn Văn Anh' });
    const getLatest = render('e1');

    await flush(getLatest);

    expect(mockedGetEntity).toHaveBeenCalledWith('e1');
    expect(getLatest().data).toEqual({ id: 'e1', canonical_name: 'Nguyễn Văn Anh' });
  });

  it('does not fetch for an empty id', async () => {
    const getLatest = render('');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(getLatest().isPending).toBe(true);
    expect(mockedGetEntity).not.toHaveBeenCalled();
  });

  it('does not fetch when explicitly disabled', async () => {
    const getLatest = render('e1', false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(getLatest().isPending).toBe(true);
    expect(mockedGetEntity).not.toHaveBeenCalled();
  });

  it('surfaces a rejected fetch as isError', async () => {
    mockedGetEntity.mockRejectedValue(new Error('not found'));
    const getLatest = render('missing');

    await flush(getLatest);

    expect(getLatest().isError).toBe(true);
  });
});
