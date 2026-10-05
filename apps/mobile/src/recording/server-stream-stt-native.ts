import { io } from 'socket.io-client';
import { STT_STREAM_NAMESPACE } from '@meetio/shared';
import { refreshAccessToken } from '../api/axios-client';
import { useSessionStore } from '../store/session.store';
import { createStreamChannel, type StreamSocket } from './server-stream-stt-channel';
import { createFallbackSttEngine } from './server-stream-stt-fallback';
import { createServerStreamSttEngine } from './server-stream-stt-engine';
import { createNativeMic } from './server-stream-stt-mic';
import { serverSttEngine, verifyRecordingOwner } from './server-stt-native';

/** A fresh socket.io connection to `/stt-stream`; `auth` is a function so every handshake carries the CURRENT token. */
function connectStreamSocket(): StreamSocket {
  const socket = io(`${process.env.EXPO_PUBLIC_WS_URL ?? ''}${STT_STREAM_NAMESPACE}`, {
    transports: ['websocket'],
    reconnection: false, // the engine reconnects, after re-checking the recording owner
    forceNew: true,
    auth: (cb) => cb({ token: useSessionStore.getState().accessToken }),
  });
  return {
    on: (event, listener) => void socket.on(event, listener),
    once: (event, listener) => void socket.once(event, listener),
    emit: (event, payload) => void socket.emit(event, payload),
    emitWithAck: (event, payload, timeoutMs) => socket.timeout(timeoutMs).emitWithAck(event, payload),
    disconnect: () => void socket.disconnect(),
  };
}

const schedule = (fn: () => void, ms: number) => {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
};

const serverStreamEngine = createServerStreamSttEngine({
  mic: createNativeMic(),
  channel: createStreamChannel({ connect: connectStreamSocket, refreshToken: refreshAccessToken }),
  verifyOwner: verifyRecordingOwner,
  schedule,
  now: Date.now,
});

/** Server mode (Phases 18-19): live streaming first, the 10 s chunk upload as the fallback. */
export const serverRecognitionEngine = createFallbackSttEngine({ primary: serverStreamEngine, secondary: serverSttEngine, now: Date.now });
