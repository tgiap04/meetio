import TestRenderer, { act } from 'react-test-renderer';
import { AxiosError } from 'axios';
import type { QaMessage } from '@meetio/shared';
import { useQaThread, type QaHistoryPageState } from './use-qa-thread';

function message(id: string, role: 'user' | 'assistant' = 'user'): QaMessage {
  return {
    id,
    role,
    content: id,
    citations: [],
    confidence: null,
    not_found: false,
    low_confidence: false,
    filters: null,
    created_at: '2026-05-01T00:00:00.000Z',
  };
}

function history(overrides: Partial<QaHistoryPageState> = {}): QaHistoryPageState {
  return {
    items: [],
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- probe over the hook's own return shape
let latest: any;

function Probe({
  historyState,
  askMutation,
  deleteMutation,
}: {
  historyState: QaHistoryPageState;
  askMutation: { mutateAsync: jest.Mock; isPending: boolean };
  deleteMutation: { mutateAsync: jest.Mock; isPending: boolean };
}) {
  latest = useQaThread(historyState, askMutation, deleteMutation);
  return null;
}

let renderer: TestRenderer.ReactTestRenderer | undefined;

function render(
  historyState: QaHistoryPageState,
  askMutation: { mutateAsync: jest.Mock; isPending: boolean },
  deleteMutation: { mutateAsync: jest.Mock; isPending: boolean },
) {
  act(() => {
    renderer = TestRenderer.create(
      <Probe askMutation={askMutation} deleteMutation={deleteMutation} historyState={historyState} />,
    );
  });
}

describe('useQaThread', () => {
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    latest = undefined;
  });

  it('starts with the history items and nothing pending', () => {
    render(history({ items: [message('m1')] }), { mutateAsync: jest.fn(), isPending: false }, {
      mutateAsync: jest.fn(),
      isPending: false,
    });
    expect(latest.items.map((m: QaMessage) => m.id)).toEqual(['m1']);
    expect(latest.pending).toBeNull();
  });

  it('shows an optimistic pending turn immediately, then appends the confirmed pair on success', async () => {
    const response = { question: message('q1'), answer: message('a1', 'assistant') };
    const mutateAsync = jest.fn().mockResolvedValue(response);
    render(history(), { mutateAsync, isPending: false }, { mutateAsync: jest.fn(), isPending: false });

    act(() => {
      latest.send({ question: 'Ai phụ trách API?' }, 'Ai phụ trách API?');
    });
    expect(latest.pending).toEqual({ question: 'Ai phụ trách API?', status: 'sending' });

    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.pending).toBeNull();
    expect(latest.items.map((m: QaMessage) => m.id)).toEqual(['q1', 'a1']);
  });

  it('shows a sent turn once when a history refetch (app back in the foreground) already contains it', async () => {
    const response = { question: message('q1'), answer: message('a1', 'assistant') };
    const askMutation = { mutateAsync: jest.fn().mockResolvedValue(response), isPending: false };
    const deleteMutation = { mutateAsync: jest.fn(), isPending: false };
    render(history(), askMutation, deleteMutation);
    act(() => {
      latest.send({ question: 'q' }, 'q');
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      renderer!.update(
        <Probe askMutation={askMutation} deleteMutation={deleteMutation} historyState={history({ items: [message('q1'), message('a1', 'assistant')] })} />,
      );
    });

    expect(latest.items.map((m: QaMessage) => m.id)).toEqual(['q1', 'a1']);
  });

  it('treats MEETING_NOT_READY as a thread-blocking state, not a retryable bubble error', async () => {
    const error = new AxiosError('not ready');
    error.response = {
      status: 409,
      data: { error: { code: 'MEETING_NOT_READY', message: 'Cuộc họp chưa xử lý xong.' } },
    } as never;
    const mutateAsync = jest.fn().mockRejectedValue(error);
    render(history(), { mutateAsync, isPending: false }, { mutateAsync: jest.fn(), isPending: false });

    act(() => {
      latest.send({ question: 'x' }, 'x');
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.meetingNotReady).toBe(true);
    expect(latest.pending).toBeNull();
  });

  it('keeps a retryable error message on the pending turn for any other failure', async () => {
    const error = new AxiosError('rate limited');
    error.response = {
      status: 429,
      data: { error: { code: 'RATE_LIMITED', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau.' } },
    } as never;
    const mutateAsync = jest.fn().mockRejectedValue(error);
    render(history(), { mutateAsync, isPending: false }, { mutateAsync: jest.fn(), isPending: false });

    act(() => {
      latest.send({ question: 'x' }, 'x');
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest.pending).toEqual({
      question: 'x',
      status: 'error',
      errorMessage: 'Bạn thao tác quá nhanh, vui lòng thử lại sau.',
    });
  });

  it('retry resends the exact last request', async () => {
    const error = new Error('boom');
    const mutateAsync = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({
      question: message('q1'),
      answer: message('a1', 'assistant'),
    });
    render(history(), { mutateAsync, isPending: false }, { mutateAsync: jest.fn(), isPending: false });

    act(() => {
      latest.send({ question: 'x', entity_id: 'e1' }, 'x');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest.pending?.status).toBe('error');

    act(() => {
      latest.retry();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mutateAsync).toHaveBeenLastCalledWith({ question: 'x', entity_id: 'e1' });
    expect(latest.pending).toBeNull();
  });

  it('deleteHistory clears local state and refetches the (now empty) history', async () => {
    const response = { question: message('q1'), answer: message('a1', 'assistant') };
    const askMutateAsync = jest.fn().mockResolvedValue(response);
    const deleteMutateAsync = jest.fn().mockResolvedValue(undefined);
    const refetch = jest.fn();
    render(
      history({ refetch }),
      { mutateAsync: askMutateAsync, isPending: false },
      { mutateAsync: deleteMutateAsync, isPending: false },
    );

    act(() => {
      latest.send({ question: 'x' }, 'x');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest.items).toHaveLength(2);

    await act(async () => {
      await latest.deleteHistory();
    });

    expect(deleteMutateAsync).toHaveBeenCalled();
    expect(latest.items).toHaveLength(0);
    expect(refetch).toHaveBeenCalled();
  });
});
