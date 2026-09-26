import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { getMeetingGraph } from '../api/entities';
import { useMeetingGraphQuery } from './use-meeting-graph-query';

jest.mock('../api/entities', () => ({
  getMeetingGraph: jest.fn(),
}));

const mockedGetMeetingGraph = getMeetingGraph as jest.Mock;

function Probe({ id, onValue }: { id: string; onValue: (value: UseQueryResult) => void }) {
  onValue(useMeetingGraphQuery(id) as unknown as UseQueryResult);
  return null;
}

function render(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest!: UseQueryResult;
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

describe('useMeetingGraphQuery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches the graph for the given meeting id', async () => {
    mockedGetMeetingGraph.mockResolvedValue({ nodes: [], edges: [] });
    const getLatest = render('m1');

    await flush(getLatest);

    expect(mockedGetMeetingGraph).toHaveBeenCalledWith('m1');
    expect(getLatest().data).toEqual({ nodes: [], edges: [] });
  });

  it('does not fetch for an empty id', async () => {
    const getLatest = render('');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(getLatest().isPending).toBe(true);
    expect(mockedGetMeetingGraph).not.toHaveBeenCalled();
  });

  it('surfaces a rejected fetch as isError', async () => {
    mockedGetMeetingGraph.mockRejectedValue(new Error('boom'));
    const getLatest = render('m1');

    await flush(getLatest);

    expect(getLatest().isError).toBe(true);
  });
});
