import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { updateSegment } from '../api/meetings';
import { meetingQueryKey } from './use-meeting-detail-query';
import { segmentsQueryKey } from './use-segments-query';
import { useUpdateSegmentMutation } from './use-segment-mutations';

jest.mock('../api/meetings', () => ({
  updateSegment: jest.fn(),
}));

const mockedUpdateSegment = updateSegment as jest.Mock;

let hookResult: ReturnType<typeof useUpdateSegmentMutation>;
let queryClient: QueryClient;

function Harness({ meetingId }: { meetingId: string }) {
  hookResult = useUpdateSegmentMutation(meetingId);
  return null;
}

function renderHarness(meetingId = 'm1') {
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  jest.spyOn(queryClient, 'invalidateQueries');
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Harness meetingId={meetingId} />
      </QueryClientProvider>,
    );
  });
  return renderer;
}

describe('useUpdateSegmentMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUpdateSegment.mockResolvedValue({ id: 's1', text: 'fixed' });
  });

  it('invalidates both the segments list and the meeting detail on success', async () => {
    renderHarness('m1');

    await act(async () => {
      await hookResult.mutateAsync({ id: 's1', body: { text: 'fixed' } });
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: segmentsQueryKey('m1') });
    // The LOW finding this test guards: has_unprocessed_edits flips
    // server-side the moment a segment save lands, so the cached meeting
    // detail must be told to refetch too — not left to default timing.
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: meetingQueryKey('m1') });
  });
});
