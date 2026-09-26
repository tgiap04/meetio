import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listSegments } from '../api/meetings';
import { segmentsQueryKey, useInfiniteSegmentsQuery } from './use-segments-query';

jest.mock('../api/meetings', () => ({
  listSegments: jest.fn(),
}));

const mockedListSegments = listSegments as jest.Mock;

function Harness({ meetingId, initialFromSeq }: { meetingId: string; initialFromSeq: number | null }) {
  useInfiniteSegmentsQuery(meetingId, initialFromSeq);
  return null;
}

function renderHarness(meetingId: string, initialFromSeq: number | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Harness initialFromSeq={initialFromSeq} meetingId={meetingId} />
      </QueryClientProvider>,
    );
  });
  return renderer;
}

describe('useInfiniteSegmentsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests the first page with no from_seq when no initial seq is given (unchanged for the transcript screen)', async () => {
    mockedListSegments.mockResolvedValue({ items: [], next_from_seq: null });
    await act(async () => {
      renderHarness('m1');
    });
    expect(mockedListSegments).toHaveBeenCalledWith('m1', { from_seq: undefined, limit: 200 });
  });

  it('requests the first page starting at the given seq when jumping from a search result', async () => {
    mockedListSegments.mockResolvedValue({ items: [], next_from_seq: null });
    await act(async () => {
      renderHarness('m1', 42);
    });
    expect(mockedListSegments).toHaveBeenCalledWith('m1', { from_seq: 42, limit: 200 });
  });

  it('keys the query on the initial seq, so jumping to a different seq starts a fresh cache entry', () => {
    expect(segmentsQueryKey('m1')).not.toEqual(segmentsQueryKey('m1', 42));
    expect(segmentsQueryKey('m1', 42)).not.toEqual(segmentsQueryKey('m1', 43));
  });
});
