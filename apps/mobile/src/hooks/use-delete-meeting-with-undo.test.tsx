import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { deleteMeeting } from '../api/meetings';
import { useDeleteMeetingWithUndo, type UseDeleteMeetingWithUndoResult } from './use-delete-meeting-with-undo';

jest.mock('../api/meetings', () => ({
  deleteMeeting: jest.fn(),
}));

const mockedDelete = deleteMeeting as jest.Mock;

let hookResult: UseDeleteMeetingWithUndoResult;

function Harness() {
  hookResult = useDeleteMeetingWithUndo();
  return null;
}

function renderHarness() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  act(() => {
    TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
}

describe('useDeleteMeetingWithUndo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedDelete.mockReset();
    mockedDelete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks the meeting pending immediately without calling the API', () => {
    renderHarness();

    act(() => {
      hookResult.startDelete('m1');
    });

    expect(hookResult.pendingDeleteId).toBe('m1');
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('sends the DELETE only after the 10s window elapses', async () => {
    renderHarness();

    act(() => {
      hookResult.startDelete('m1');
    });

    await act(async () => {
      jest.advanceTimersByTime(9_999);
    });
    expect(mockedDelete).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockedDelete).toHaveBeenCalledWith('m1');
    expect(hookResult.pendingDeleteId).toBeNull();
  });

  it('never calls the API when undo is pressed before the window elapses', async () => {
    renderHarness();

    act(() => {
      hookResult.startDelete('m1');
    });
    act(() => {
      hookResult.undoDelete();
    });
    expect(hookResult.pendingDeleteId).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(mockedDelete).not.toHaveBeenCalled();
  });
});
