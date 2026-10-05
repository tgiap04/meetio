import { ApiErrorCode, SttStreamClientEvent, SttStreamServerEvent, type SttStreamAck } from '@meetio/shared';
import { StreamStartError, type StreamChannel, type StreamChannelEvents } from './server-stream-stt-ports';

/** The slice of a socket.io client the channel uses — injectable so tests need no network. */
export interface StreamSocket {
  on(event: string, listener: (payload: unknown) => void): void;
  once(event: string, listener: (payload: unknown) => void): void;
  emit(event: string, payload: ArrayBuffer): void;
  /** Resolves with the server's ack; rejects when none arrives within `timeoutMs`. */
  emitWithAck(event: string, payload: unknown, timeoutMs: number): Promise<unknown>;
  disconnect(): void;
}

export interface StreamChannelDeps {
  /** A fresh, connecting socket that reads the CURRENT access token on every handshake. */
  connect(): StreamSocket;
  /** Refreshes the access token (rejects when the session is over). */
  refreshToken(): Promise<unknown>;
  connectTimeoutMs?: number;
  ackTimeoutMs?: number;
}

const codeOf = (error: unknown): string | undefined => (error as { data?: { code?: unknown } } | null)?.data?.code as string | undefined;
const textOf = (payload: unknown): string | null => {
  const text = (payload as { text?: unknown } | null)?.text;
  return typeof text === 'string' ? text : null;
};

/**
 * The `/stt-stream` socket (api-spec §8b) as a `StreamChannel`. One socket per stream; reconnecting
 * is the engine's job (it re-checks the recording owner first), so this never retries on its own
 * except for a single token refresh when the handshake says the access token expired. Wire data is
 * checked, not trusted; transcripts and audio are never logged.
 */
export function createStreamChannel(deps: StreamChannelDeps): StreamChannel {
  const connectTimeoutMs = deps.connectTimeoutMs ?? 10_000;
  const ackTimeoutMs = deps.ackTimeoutMs ?? 10_000;
  let socket: StreamSocket | null = null;

  function connectOnce(): Promise<StreamSocket> {
    const s = deps.connect();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        s.disconnect();
        reject(new StreamStartError('NETWORK', 'Connect timed out'));
      }, connectTimeoutMs);
      s.once('connect', () => {
        clearTimeout(timer);
        resolve(s);
      });
      s.once('connect_error', (error) => {
        clearTimeout(timer);
        s.disconnect();
        reject(new StreamStartError(codeOf(error) ?? 'NETWORK', 'Connect failed'));
      });
    });
  }

  async function connect(): Promise<StreamSocket> {
    try {
      return await connectOnce();
    } catch (error) {
      if (!(error instanceof StreamStartError) || error.code !== ApiErrorCode.TOKEN_EXPIRED) throw error;
    }
    try {
      await deps.refreshToken();
    } catch {
      throw new StreamStartError(ApiErrorCode.UNAUTHORIZED, 'Session expired');
    }
    return connectOnce();
  }

  function listen(s: StreamSocket, events: StreamChannelEvents) {
    s.on(SttStreamServerEvent.PARTIAL, (p) => {
      const text = textOf(p);
      if (socket === s && text !== null) events.onPartial(text);
    });
    s.on(SttStreamServerEvent.FINAL, (p) => {
      const text = textOf(p);
      if (socket === s && text !== null) events.onFinal(text);
    });
    s.on(SttStreamServerEvent.ERROR, (p) => {
      if (socket === s) events.onFatal(String((p as { code?: unknown } | null)?.code ?? 'UNKNOWN'));
    });
    s.on('disconnect', () => {
      if (socket === s) events.onDown();
    });
  }

  function close() {
    const s = socket;
    socket = null; // first, so the disconnect we cause is not reported as a drop
    s?.disconnect();
  }

  return {
    async open(params, events) {
      close();
      const s = await connect();
      socket = s;
      listen(s, events);
      let ack: SttStreamAck | null = null;
      try {
        ack = (await s.emitWithAck(SttStreamClientEvent.START, { language: params.language, meeting_id: params.meetingId }, ackTimeoutMs)) as SttStreamAck;
      } catch {
        // no ack in time
      }
      if (ack?.ok !== true) {
        close();
        throw new StreamStartError(ack && !ack.ok ? ack.error.code : 'NETWORK', 'The server did not start the stream');
      }
    },

    send(pcm) {
      socket?.emit(SttStreamClientEvent.AUDIO, pcm);
    },

    async end() {
      if (!socket) return;
      await socket.emitWithAck(SttStreamClientEvent.STOP, undefined, ackTimeoutMs);
    },

    close,
  };
}
