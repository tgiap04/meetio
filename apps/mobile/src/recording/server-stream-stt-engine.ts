import { SttStreamErrorCode } from '@meetio/shared';
import { createPcmConverter, pcmVolume } from './server-stream-stt-pcm';
import { STREAM_FAILED, type ServerStreamSttDeps, type StreamChannelEvents } from './server-stream-stt-ports';
import { ServerSttError } from './server-stt-ports';
import { createUplink } from './server-stream-stt-uplink';
import type { SttEngine, SttHandlers, SttStartOptions } from './stt-engine';

/**
 * Server-side recognition as a live stream (Phase 19): PCM from the microphone goes to the server
 * in ~150 ms frames, and the server answers with `stt_partial` (volatile, shown only when `interim`
 * was asked for) and `stt_final` (a settled stretch). The text lags the speaker by ~1-2 s instead
 * of the ~10-15 s of the chunked engine (server-stt-engine.ts), which stays as the fallback.
 *
 * Same contract with the recognition pipeline as the chunked engine: `onStart` once audio is
 * flowing; `onEnd` only after `stop()` has flushed the last words, or after a fatal error — never
 * on its own otherwise. A stream that cannot work reports `onError('stream-failed')` and then
 * `onEnd` (the fallback engine, server-stream-stt-fallback.ts, takes over from there). Audio
 * lives only in RAM; neither audio nor text is logged.
 */
type State = 'idle' | 'starting' | 'recording' | 'stopping';

export function createServerStreamSttEngine(deps: ServerStreamSttDeps): SttEngine {
  const frameMs = deps.frameMs ?? 150;
  const flushTimeoutMs = deps.flushTimeoutMs ?? 4000;
  const reconnectDelays = deps.reconnectDelaysMs ?? [1000, 2000, 4000];
  const meterIntervalMs = deps.meterIntervalMs ?? 150;
  const subscribers = new Set<SttHandlers>();

  let state: State = 'idle';
  let epoch = 0; // every accepted start() bumps it; stale async work compares and gives up
  let stopRequested = false;
  let options: SttStartOptions | null = null;
  let reconnecting = false;
  let droppedWhileStarting = false;
  let lastMeterAt = 0;
  let convert = createPcmConverter();
  const uplink = createUplink((frame) => deps.channel.send(frame), frameMs, deps.maxBacklogMs ?? 4000);

  const emit = (fn: (h: SttHandlers) => void) => subscribers.forEach(fn);
  const live = (e: number) => e === epoch && (state === 'recording' || state === 'starting');

  const events = (e: number): StreamChannelEvents => ({
    onPartial: (text) => {
      if (e === epoch && state !== 'idle' && options?.interim && text) emit((h) => h.onResult(text, false));
    },
    // Finals still arrive while `stopping`: that is the flush of the last words.
    onFinal: (text) => {
      if (e === epoch && state !== 'idle' && text) emit((h) => h.onResult(text, true));
    },
    // The access token ran out mid-stream: not a broken stream. Reconnect (the channel refreshes the token on handshake).
    onFatal: (code) => void (code === SttStreamErrorCode.TOKEN_EXPIRED ? reconnect(e) : fail(e, STREAM_FAILED)),
    onDown: () => {
      if (state === 'starting') droppedWhileStarting = true; // acted on once recording begins
      else void reconnect(e);
    },
  });

  function release() {
    deps.mic.stop();
    deps.channel.close();
  }

  function finish(e: number) {
    if (e !== epoch) return;
    state = 'idle';
    emit((h) => h.onEnd());
  }

  async function fail(e: number, code: string, message = 'Stream failed') {
    if (!live(e)) return;
    state = 'stopping';
    release();
    emit((h) => h.onError(code, message));
    finish(e);
  }

  function onBuffer(e: number, data: ArrayBuffer, sampleRate: number, channels: number) {
    if (e !== epoch || state !== 'recording') return;
    const samples = convert(data, sampleRate, channels);
    if (options?.volume && deps.now() - lastMeterAt >= meterIntervalMs) {
      lastMeterAt = deps.now();
      emit((h) => h.onVolume(pcmVolume(samples)));
    }
    uplink.push(samples);
  }

  /** The connection dropped mid-recording: reopen it (owner re-verified each time), replaying the backlog. */
  async function reconnect(e: number) {
    if (reconnecting || !live(e) || state !== 'recording') return;
    reconnecting = true;
    uplink.setOnline(false);
    try {
      for (const delay of reconnectDelays) {
        await new Promise<void>((resolve) => deps.schedule(resolve, delay));
        if (!live(e) || state !== 'recording') return;
        try {
          if (options?.upload) deps.verifyOwner?.(options.upload.ownerId);
        } catch {
          await fail(e, 'owner-changed', 'Signed-in user is not the meeting owner');
          return;
        }
        deps.channel.close();
        try {
          await deps.channel.open({ language: options!.lang, meetingId: options!.upload?.meetingId }, events(e));
        } catch {
          continue;
        }
        if (!live(e)) return;
        const lost = uplink.takeDroppedMs();
        if (lost > 0) emit((h) => h.onGap?.(lost));
        uplink.setOnline(true);
        return;
      }
      await fail(e, STREAM_FAILED, 'Cannot reconnect the stream');
    } finally {
      reconnecting = false;
    }
  }

  async function run(e: number, opts: SttStartOptions) {
    try {
      try {
        if (opts.upload) deps.verifyOwner?.(opts.upload.ownerId);
      } catch {
        throw new ServerSttError('owner-changed', 'Signed-in user is not the meeting owner');
      }
      await deps.channel.open({ language: opts.lang, meetingId: opts.upload?.meetingId }, events(e)).catch((error: unknown) => {
        throw new ServerSttError(STREAM_FAILED, error instanceof Error ? error.message : 'Cannot open the stream');
      });
      if (e === epoch && state === 'starting') await deps.mic.start((b) => onBuffer(e, b.data, b.sampleRate, b.channels));
    } catch (error) {
      const mapped = error instanceof ServerSttError ? error.code : 'audio-capture';
      // A microphone that cannot be opened for the stream may still work for the chunked recorder: let the fallback try.
      const code = mapped === 'audio-capture' ? STREAM_FAILED : mapped;
      await fail(e, code, error instanceof Error ? error.message : 'Cannot start the stream');
      return;
    }
    if (e !== epoch || state !== 'starting') return;
    state = 'recording';
    emit((h) => h.onStart());
    if (stopRequested) await shutdown(e);
    else if (droppedWhileStarting) void reconnect(e);
  }

  /** `stop()`: stop the microphone, send the tail, wait (bounded) for the server to flush its last words. */
  async function shutdown(e: number) {
    if (e !== epoch || state !== 'recording') return;
    state = 'stopping';
    deps.mic.stop();
    uplink.setOnline(true);
    uplink.flush();
    let cancel: () => void = () => undefined;
    const timeout = new Promise<void>((resolve) => {
      cancel = deps.schedule(resolve, flushTimeoutMs);
    });
    await Promise.race([deps.channel.end().catch(() => undefined), timeout]);
    cancel();
    deps.channel.close();
    finish(e);
  }

  return {
    // `bluetooth` does not apply: the OS picks the input.
    start(opts) {
      if (state !== 'idle') return;
      state = 'starting';
      epoch += 1;
      stopRequested = false;
      reconnecting = false;
      droppedWhileStarting = false;
      options = opts;
      convert = createPcmConverter();
      void run(epoch, opts);
    },

    stop() {
      if (state === 'idle' || state === 'stopping' || stopRequested) return;
      stopRequested = true;
      if (state === 'recording') void shutdown(epoch);
    },

    subscribe(handlers) {
      subscribers.add(handlers);
      return () => void subscribers.delete(handlers);
    },
  };
}
