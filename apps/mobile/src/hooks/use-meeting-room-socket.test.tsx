import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { ApiErrorCode, WsClientEvent, WsServerEvent } from '@meetio/shared';
import { useSessionStore } from '../store/session.store';
import { useMeetingRoomSocket } from './use-meeting-room-socket';

interface FakeSocket {
  emit: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
  handlers: Map<string, (payload: unknown) => void>;
}

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

jest.mock('../api/axios-client', () => ({
  refreshAccessToken: jest.fn(),
}));

import { refreshAccessToken } from '../api/axios-client';

const mockedIo = io as jest.MockedFunction<typeof io>;
const mockedRefresh = refreshAccessToken as jest.Mock;

function createFakeSocket(): FakeSocket {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    emit: jest.fn(),
    on: jest.fn((event: string, handler: (payload: unknown) => void) => handlers.set(event, handler)),
    off: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    handlers,
  };
}

/** Invokes the `auth` option the hook passed to `io()` the way socket.io-client
 *  itself does — as a function taking a callback — and returns what it sent. */
function readAuthPayload(): { token: string | null } {
  const options = mockedIo.mock.calls.at(-1)?.[1] as { auth: (cb: (data: unknown) => void) => void };
  let captured: { token: string | null } | undefined;
  options.auth((data) => {
    captured = data as { token: string | null };
  });
  return captured as { token: string | null };
}

function Harness({ meetingId }: { meetingId?: string }) {
  useMeetingRoomSocket(meetingId);
  return null;
}

describe('useMeetingRoomSocket', () => {
  let fakeSocket: FakeSocket;
  let queryClient: QueryClient;
  const renderers: TestRenderer.ReactTestRenderer[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    fakeSocket = createFakeSocket();
    mockedIo.mockReturnValue(fakeSocket as never);
    useSessionStore.setState({ accessToken: 'token-1', refreshToken: 'r1', authStatus: 'authenticated' });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    jest.spyOn(queryClient, 'invalidateQueries');
  });

  afterEach(() => {
    // Each Harness subscribes to the (module-global) Zustand store; leaving
    // one mounted past its test lets it keep reacting to later tests'
    // `setState` calls.
    while (renderers.length > 0) {
      act(() => renderers.pop()?.unmount());
    }
  });

  function render(meetingId?: string) {
    const renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Harness meetingId={meetingId} />
      </QueryClientProvider>,
    );
    renderers.push(renderer);
    return renderer;
  }

  it('does nothing when there is no meeting id', () => {
    act(() => {
      render(undefined);
    });
    expect(mockedIo).not.toHaveBeenCalled();
  });

  it('passes auth as a function, read fresh at connection time, with the current access token', () => {
    act(() => {
      render('m1');
    });

    expect(mockedIo).toHaveBeenCalledWith(
      expect.stringContaining('/meeting-room'),
      expect.objectContaining({ auth: expect.any(Function) }),
    );
    expect(readAuthPayload()).toEqual({ token: 'token-1' });
  });

  it('joins the meeting room once the socket actually connects', () => {
    act(() => {
      render('m1');
    });

    expect(fakeSocket.emit).not.toHaveBeenCalledWith(WsClientEvent.JOIN_MEETING, expect.anything(), expect.anything());
    act(() => {
      fakeSocket.handlers.get('connect')?.(undefined);
    });
    expect(fakeSocket.emit).toHaveBeenCalledWith(
      WsClientEvent.JOIN_MEETING,
      { meeting_id: 'm1' },
      expect.any(Function),
    );
  });

  it('refetches the meeting when processing_status arrives for this meeting', () => {
    act(() => {
      render('m1');
    });

    const handler = fakeSocket.handlers.get(WsServerEvent.PROCESSING_STATUS);
    act(() => {
      handler?.({ meeting_id: 'm1', status: 'processing', step: 'embed' });
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['meeting', 'm1'] });
  });

  it('ignores events for a different meeting', () => {
    act(() => {
      render('m1');
    });

    const handler = fakeSocket.handlers.get(WsServerEvent.MEETING_READY);
    act(() => {
      handler?.({ meeting_id: 'other-meeting' });
    });

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('leaves the room and disconnects on unmount', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = render('m1');
    });

    act(() => {
      renderer.unmount();
    });

    expect(fakeSocket.emit).toHaveBeenCalledWith(WsClientEvent.LEAVE_MEETING, { meeting_id: 'm1' });
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });

  describe('token-expiry recovery', () => {
    it('refreshes the token and reconnects on a TOKEN_EXPIRED connect_error, then rejoins on connect', async () => {
      mockedRefresh.mockImplementation(async () => {
        useSessionStore.getState().setTokens({ accessToken: 'token-2', refreshToken: 'r2' });
      });
      act(() => {
        render('m1');
      });

      await act(async () => {
        fakeSocket.handlers.get('connect_error')?.({ data: { code: ApiErrorCode.TOKEN_EXPIRED } } as never);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockedRefresh).toHaveBeenCalledTimes(1);
      expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
      // The next connection attempt reads the store fresh — proves it's not
      // still holding onto the stale token from mount time.
      expect(readAuthPayload()).toEqual({ token: 'token-2' });

      fakeSocket.emit.mockClear();
      act(() => {
        fakeSocket.handlers.get('connect')?.(undefined);
      });
      expect(fakeSocket.emit).toHaveBeenCalledWith(
        WsClientEvent.JOIN_MEETING,
        { meeting_id: 'm1' },
        expect.any(Function),
      );
    });

    it('refreshes and reconnects on a server-initiated disconnect (reason: io server disconnect)', async () => {
      mockedRefresh.mockResolvedValue(undefined);
      act(() => {
        render('m1');
      });

      await act(async () => {
        fakeSocket.handlers.get('disconnect')?.('io server disconnect' as never);
        await Promise.resolve();
      });

      expect(mockedRefresh).toHaveBeenCalledTimes(1);
      expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
    });

    it('does not attempt recovery for an ordinary client-side disconnect reason', async () => {
      act(() => {
        render('m1');
      });

      await act(async () => {
        fakeSocket.handlers.get('disconnect')?.('transport close' as never);
        await Promise.resolve();
      });

      expect(mockedRefresh).not.toHaveBeenCalled();
      expect(fakeSocket.connect).not.toHaveBeenCalled();
    });

    it('does not attempt recovery for a connect_error with no auth-failure code', async () => {
      act(() => {
        render('m1');
      });

      await act(async () => {
        fakeSocket.handlers.get('connect_error')?.(new Error('network unreachable') as never);
        await Promise.resolve();
      });

      expect(mockedRefresh).not.toHaveBeenCalled();
    });

    it('stops reconnecting (no infinite loop) once the token refresh itself fails', async () => {
      mockedRefresh.mockRejectedValue(new Error('refresh token invalid'));
      act(() => {
        render('m1');
      });

      await act(async () => {
        fakeSocket.handlers.get('connect_error')?.({ data: { code: ApiErrorCode.TOKEN_EXPIRED } } as never);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockedRefresh).toHaveBeenCalledTimes(1);
      expect(fakeSocket.disconnect).toHaveBeenCalled();
      expect(fakeSocket.connect).not.toHaveBeenCalled();

      // A further connect_error after giving up must not trigger yet another
      // refresh attempt — that would be the infinite loop the fix prevents.
      await act(async () => {
        fakeSocket.handlers.get('connect_error')?.({ data: { code: ApiErrorCode.TOKEN_EXPIRED } } as never);
        await Promise.resolve();
      });
      expect(mockedRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
