import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query';
import type { QaHistoryResponse } from '@meetio/shared';
import { getGlobalQaHistory, getMeetingQaHistory } from '../api/qa';
import {
  flattenQaHistoryPages,
  useGlobalQaHistoryQuery,
  useMeetingQaHistoryQuery,
} from './use-qa-history-query';

type Result = UseInfiniteQueryResult<InfiniteData<QaHistoryResponse>>;

jest.mock('../api/qa', () => ({
  getMeetingQaHistory: jest.fn(),
  getGlobalQaHistory: jest.fn(),
}));

const mockedGetMeetingHistory = getMeetingQaHistory as jest.Mock;
const mockedGetGlobalHistory = getGlobalQaHistory as jest.Mock;

function Probe({ useHook, onValue }: { useHook: () => Result; onValue: (v: Result) => void }) {
  onValue(useHook());
  return null;
}

let activeRenderer: TestRenderer.ReactTestRenderer | undefined;

function render(useHook: () => Result) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest!: Result;
  act(() => {
    activeRenderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe onValue={(value) => (latest = value)} useHook={useHook} />
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

function message(id: string): QaHistoryResponse['items'][number] {
  return {
    id,
    role: 'user',
    content: id,
    citations: [],
    confidence: null,
    not_found: false,
    low_confidence: false,
    filters: null,
    created_at: '2026-05-01T00:00:00.000Z',
  };
}

describe('flattenQaHistoryPages', () => {
  it('flattens pages oldest-first: the most-recently-fetched page (page 1) sorts last', () => {
    const page1 = { items: [message('m3'), message('m4')], next_before: 'cursor-1' }; // most recent, fetched first
    const page2 = { items: [message('m1'), message('m2')], next_before: null }; // older, fetched second
    expect(flattenQaHistoryPages([page1, page2]).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('returns an empty array when there are no pages yet', () => {
    expect(flattenQaHistoryPages(undefined)).toEqual([]);
  });
});

describe('useMeetingQaHistoryQuery', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
  });

  it('fetches the first page with no `before`', async () => {
    mockedGetMeetingHistory.mockResolvedValue({ items: [message('m1')], next_before: null });
    const getLatest = render(() => useMeetingQaHistoryQuery('meeting-1'));

    await flush(getLatest);

    expect(mockedGetMeetingHistory).toHaveBeenCalledWith('meeting-1', { before: undefined, limit: 50 });
  });

  it('pages backward using next_before', async () => {
    mockedGetMeetingHistory
      .mockResolvedValueOnce({ items: [message('m2')], next_before: 'cursor-1' })
      .mockResolvedValueOnce({ items: [message('m1')], next_before: null });
    const getLatest = render(() => useMeetingQaHistoryQuery('meeting-1'));

    await flush(getLatest);
    await act(async () => {
      await getLatest().fetchNextPage();
    });

    expect(mockedGetMeetingHistory).toHaveBeenLastCalledWith('meeting-1', { before: 'cursor-1', limit: 50 });
  });

  it('stays disabled with no meeting id', () => {
    const getLatest = render(() => useMeetingQaHistoryQuery(''));
    expect(getLatest().fetchStatus).toBe('idle');
    expect(mockedGetMeetingHistory).not.toHaveBeenCalled();
  });
});

describe('useGlobalQaHistoryQuery', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
  });

  it('fetches the global thread with no meeting scoping', async () => {
    mockedGetGlobalHistory.mockResolvedValue({ items: [], next_before: null });
    const getLatest = render(() => useGlobalQaHistoryQuery());

    await flush(getLatest);

    expect(mockedGetGlobalHistory).toHaveBeenCalledWith({ before: undefined, limit: 50 });
  });

  it('surfaces a rejected request as isError', async () => {
    mockedGetGlobalHistory.mockRejectedValue(new Error('boom'));
    const getLatest = render(() => useGlobalQaHistoryQuery());

    await flush(getLatest);

    expect(getLatest().isError).toBe(true);
  });
});
