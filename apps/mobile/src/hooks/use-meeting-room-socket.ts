import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import {
  ApiErrorCode,
  MEETING_ROOM_NAMESPACE,
  WsClientEvent,
  WsServerEvent,
  type MeetingReadyPayload,
  type ProcessingStatusPayload,
  type WsJoinAck,
} from '@meetio/shared';
import { refreshAccessToken } from '../api/axios-client';
import { useSessionStore } from '../store/session.store';
import { meetingQueryKey } from './use-meeting-detail-query';

/** Shape of the error socket.io-client hands `connect_error` listeners when
 *  the server's handshake middleware rejects the connection — carries
 *  whatever `data` the server's `next(new Error(...))` attached. */
interface HandshakeError extends Error {
  data?: { code?: string };
}

/**
 * Joins `/meeting-room` for one meeting and refetches its detail whenever the
 * server reports pipeline progress (US-28) or completion (US-24's
 * `has_unprocessed_edits` clears once the run that consumed the edit lands).
 * The socket is scoped to this one screen: it connects on mount, leaves and
 * disconnects on unmount or when `meetingId`/the access token changes.
 *
 * Token-expiry recovery (fixed in review): `auth` is a FUNCTION, not a plain
 * object, so socket.io-client re-evaluates it — reading the session store's
 * *current* access token — on every single (re)connection attempt, including
 * the ones its own automatic-reconnect logic drives. Without that, a static
 * `auth: { token }` object would keep presenting the same now-expired token
 * forever once the server disconnects this socket for `TOKEN_EXPIRED`,
 * because nothing about that failure on its own updates the store. On top of
 * the fresh-token-per-attempt fix, `connect_error` (handshake refusal) and a
 * server-initiated `disconnect` (reason `'io server disconnect'`, which
 * socket.io-client deliberately does NOT auto-retry) both run the same
 * `/auth/refresh` single-flight `axios-client.ts` already uses for HTTP, then
 * reconnect explicitly. The room is rejoined on every successful `connect`
 * (initial or recovered), so a reconnect never leaves the server not knowing
 * this client is in the room. If the refresh itself fails — the refresh
 * token is dead too, i.e. the user is effectively logged out — recovery
 * stops and the socket disconnects rather than retrying forever against a
 * session that will never become valid again.
 */
export function useMeetingRoomSocket(meetingId: string | undefined): void {
  const queryClient = useQueryClient();
  const accessToken = useSessionStore((state) => state.accessToken);

  useEffect(() => {
    if (!meetingId || !accessToken) {
      return undefined;
    }

    const baseUrl = process.env.EXPO_PUBLIC_WS_URL ?? '';
    const socket = io(`${baseUrl}${MEETING_ROOM_NAMESPACE}`, {
      auth: (callback: (data: { token: string | null }) => void) =>
        callback({ token: useSessionStore.getState().accessToken }),
      transports: ['websocket'],
    });

    let stopped = false;
    let isRecovering = false;

    function joinRoom() {
      socket.emit(WsClientEvent.JOIN_MEETING, { meeting_id: meetingId }, (ack: WsJoinAck) => {
        if (!ack.ok) {
          // Non-fatal: the detail screen still shows whatever it last fetched;
          // this only means realtime updates won't arrive for this session.
          console.warn('[meeting-room] join_meeting refused', ack.error);
        }
      });
    }

    async function recoverFromExpiredToken() {
      if (stopped || isRecovering) {
        return;
      }
      isRecovering = true;
      try {
        await refreshAccessToken();
        if (!stopped) {
          socket.connect();
        }
      } catch {
        // The refresh token is invalid too — this is a dead session, not a
        // transient failure. Stop trying: reconnecting with a token that can
        // never become valid again would retry forever. `axios-client.ts`'s
        // own refresh-failure path already clears the session on the HTTP
        // side; this socket just needs to stop knocking.
        stopped = true;
        socket.disconnect();
      } finally {
        isRecovering = false;
      }
    }

    function isAuthFailureCode(code: string | undefined): boolean {
      return code === ApiErrorCode.TOKEN_EXPIRED || code === ApiErrorCode.UNAUTHORIZED;
    }

    function handleConnect() {
      joinRoom();
    }

    function handleConnectError(error: HandshakeError) {
      if (isAuthFailureCode(error?.data?.code)) {
        recoverFromExpiredToken();
      }
    }

    function handleDisconnect(reason: string) {
      if (reason === 'io server disconnect') {
        recoverFromExpiredToken();
      }
    }

    function refetchOnMatch(payload: { meeting_id: string }) {
      if (payload.meeting_id !== meetingId) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: meetingQueryKey(meetingId as string) });
    }

    const handleProcessingStatus = (payload: ProcessingStatusPayload) => refetchOnMatch(payload);
    const handleMeetingReady = (payload: MeetingReadyPayload) => refetchOnMatch(payload);

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', handleDisconnect);
    socket.on(WsServerEvent.PROCESSING_STATUS, handleProcessingStatus);
    socket.on(WsServerEvent.MEETING_READY, handleMeetingReady);

    return () => {
      stopped = true;
      socket.emit(WsClientEvent.LEAVE_MEETING, { meeting_id: meetingId });
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('disconnect', handleDisconnect);
      socket.off(WsServerEvent.PROCESSING_STATUS, handleProcessingStatus);
      socket.off(WsServerEvent.MEETING_READY, handleMeetingReady);
      socket.disconnect();
    };
  }, [meetingId, accessToken, queryClient]);
}
