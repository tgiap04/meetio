import { io, type Socket } from 'socket.io-client';
import {
  ApiErrorCode,
  MEETING_ROOM_NAMESPACE,
  WsClientEvent,
  WsServerEvent,
  type SegmentAckPayload,
  type SegmentErrorPayload,
  type SegmentTranslatedPayload,
  type SegmentTranslationFailedPayload,
  type TranscriptSegmentPayload,
  type WsJoinAck,
} from '@meetio/shared';
import { refreshAccessToken } from '../api/axios-client';
import { useSessionStore } from '../store/session.store';
import { setLiveTranslation } from '../recording/recording.store';

/**
 * The realtime channel for the meeting being recorded right now (api-spec §8). Segments sent here
 * are acked one by one after the server commits them; the sync worker deletes its local copy only
 * on that ack. Backlogs and other meetings go through `/segments/bulk` instead.
 */
export interface RealtimeHandlers {
  onReady(meetingId: string): void;
  onAck(meetingId: string, seq: number): void;
  onSegmentError(meetingId: string, seq: number, code: string): void;
  onDown(): void;
}

export interface RealtimePort {
  /** Connected and joined to this meeting's room. */
  isReady(meetingId: string): boolean;
  open(meetingId: string): void;
  send(meetingId: string, segment: TranscriptSegmentPayload): void;
  close(): void;
}

export function createMeetingSocket(handlers: RealtimeHandlers): RealtimePort {
  let socket: Socket | null = null;
  let meetingId: string | null = null;
  let joined = false;

  const reconnectWithFreshToken = () => {
    refreshAccessToken()
      .then(() => socket?.connect())
      .catch(() => handlers.onDown()); // refresh failed → session is over; the axios layer signs out
  };

  const join = () => {
    const id = meetingId;
    if (!socket || !id) return;
    socket.emit(WsClientEvent.JOIN_MEETING, { meeting_id: id }, (ack: WsJoinAck) => {
      if (id !== meetingId) return;
      joined = ack.ok;
      if (ack.ok) handlers.onReady(id);
    });
  };

  const connect = () => {
    const s = io(`${process.env.EXPO_PUBLIC_WS_URL ?? ''}${MEETING_ROOM_NAMESPACE}`, {
      transports: ['websocket'],
      // A function, so every (re)connect reads the CURRENT access token, never the one from open().
      auth: (cb) => cb({ token: useSessionStore.getState().accessToken }),
    });
    s.on('connect', join);
    s.on('disconnect', (reason) => {
      joined = false;
      handlers.onDown();
      // socket.io does not auto-retry a server-initiated disconnect (e.g. expired token) — do it here.
      if (reason === 'io server disconnect') reconnectWithFreshToken();
    });
    s.on('connect_error', (err: Error & { data?: { code?: string } }) => {
      joined = false;
      handlers.onDown();
      if (err.data?.code === ApiErrorCode.TOKEN_EXPIRED) reconnectWithFreshToken();
    });
    s.on(WsServerEvent.SEGMENT_ACK, (p: SegmentAckPayload) => meetingId && handlers.onAck(meetingId, p.seq));
    s.on(WsServerEvent.SEGMENT_ERROR, (p: SegmentErrorPayload) => {
      if (!meetingId) return;
      // An expired token comes with a server disconnect, handled above.
      handlers.onSegmentError(meetingId, p.seq, p.code);
    });
    // Phase 09: translations for the recording on screen. Wire data is checked, not trusted.
    s.on(WsServerEvent.SEGMENT_TRANSLATED, (p: unknown) => {
      const { meeting_id: id, seq, translated_text: text, translated_to: to } = (p ?? {}) as Partial<SegmentTranslatedPayload>;
      // A late event from the meeting this socket just left must not land in the current one.
      if (meetingId && id === meetingId && typeof seq === 'number' && typeof text === 'string' && typeof to === 'string') {
        setLiveTranslation(meetingId, seq, { status: 'done', text, to });
      }
    });
    s.on(WsServerEvent.SEGMENT_TRANSLATION_FAILED, (p: unknown) => {
      const { meeting_id: id, seq } = (p ?? {}) as Partial<SegmentTranslationFailedPayload>;
      if (meetingId && id === meetingId && typeof seq === 'number') setLiveTranslation(meetingId, seq, { status: 'failed' });
    });
    return s;
  };

  return {
    isReady: (id) => joined && meetingId === id && socket?.connected === true,
    open(id) {
      if (meetingId === id && socket) return;
      if (socket && meetingId) socket.emit(WsClientEvent.LEAVE_MEETING, { meeting_id: meetingId });
      meetingId = id;
      joined = false;
      if (socket) join();
      else socket = connect();
    },
    send(id, segment) {
      if (joined && meetingId === id) socket?.emit(WsClientEvent.TRANSCRIPT_SEGMENT, segment);
    },
    close() {
      socket?.disconnect();
      socket?.removeAllListeners();
      socket = null;
      meetingId = null;
      joined = false;
    },
  };
}
