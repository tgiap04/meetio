import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query';
import type { EntityTimelineResponse } from '@meetio/shared';
import { getEntityTimeline } from '../api/entities';
import { useEntityTimelineQuery } from './use-entity-timeline-query';

type Result = UseInfiniteQueryResult<InfiniteData<EntityTimelineResponse>>;

jest.mock('../api/entities', () => ({
  getEntityTimeline: jest.fn(),
}));

const mockedGetTimeline = getEntityTimeline as jest.Mock;

function Probe({ id, onValue }: { id: string; onValue: (value: Result) => void }) {
  onValue(useEntityTimelineQuery(id));
  return null;
}

function render(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest!: Result;
  act(() => {
    TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe id={id} onValue={(value) => (latest = value)} />
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

describe('useEntityTimelineQuery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches page one with the page size', async () => {
    mockedGetTimeline.mockResolvedValue({ items: [{ meeting_id: 'm1' }], next_offset: null });
    const getLatest = render('e1');

    await flush(getLatest);

    expect(mockedGetTimeline).toHaveBeenCalledWith('e1', { limit: 20, offset: 0 });
    expect(getLatest().data?.pages[0].items).toEqual([{ meeting_id: 'm1' }]);
  });

  it('pages forward using next_offset', async () => {
    mockedGetTimeline
      .mockResolvedValueOnce({ items: [{ meeting_id: 'm1' }], next_offset: 20 })
      .mockResolvedValueOnce({ items: [{ meeting_id: 'm2' }], next_offset: null });
    const getLatest = render('e1');

    await flush(getLatest);
    await act(async () => {
      await getLatest().fetchNextPage();
    });

    expect(mockedGetTimeline).toHaveBeenCalledTimes(2);
    expect(mockedGetTimeline).toHaveBeenLastCalledWith('e1', { limit: 20, offset: 20 });
  });

  it('does not fetch for an empty id', async () => {
    const getLatest = render('');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(getLatest().isPending).toBe(true);
    expect(mockedGetTimeline).not.toHaveBeenCalled();
  });
});
