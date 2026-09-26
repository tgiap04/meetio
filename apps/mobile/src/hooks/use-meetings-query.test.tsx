import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listMeetings } from '../api/meetings';
import { useInfiniteMeetingsQuery } from './use-meetings-query';

jest.mock('../api/meetings', () => ({
  listMeetings: jest.fn(),
}));

const mockedListMeetings = listMeetings as jest.Mock;

let hookResult: ReturnType<typeof useInfiniteMeetingsQuery>;

function Harness({ enabled }: { enabled: boolean }) {
  hookResult = useInfiniteMeetingsQuery({ q: 'standup' }, { enabled });
  return null;
}

function renderHarness(enabled: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Harness enabled={enabled} />
      </QueryClientProvider>,
    );
  });
  return renderer;
}

describe('useInfiniteMeetingsQuery enabled option', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not call the API when enabled is false', () => {
    renderHarness(false);
    expect(mockedListMeetings).not.toHaveBeenCalled();
    expect(hookResult.isPending).toBe(true);
  });

  it('calls the API when enabled is true (the default, unchanged for existing callers)', async () => {
    mockedListMeetings.mockResolvedValue({ items: [], next_cursor: null });
    await act(async () => {
      renderHarness(true);
    });
    expect(mockedListMeetings).toHaveBeenCalledWith({ q: 'standup', cursor: undefined });
  });
});
