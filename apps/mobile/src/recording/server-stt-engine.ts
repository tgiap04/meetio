import { STT_CHUNK_MS } from '@meetio/shared';
import { dbfsToVolume, ServerSttError, type ServerSttDeps } from './server-stt-ports';
import type { SttEngine, SttHandlers, SttStartOptions } from './stt-engine';

/**
 * Server-side recognition (Phase 18): a drop-in `SttEngine` for phones that cannot recognise
 * speech on-device. It records ~10s chunks, uploads them one after another and reports each
 * transcript as a FINAL result — there are no partials, so the screen lags the speaker by one
 * chunk plus the upload.
 *
 * Pure core: the microphone, the upload, the file system and the clock are injected (like
 * restart-loop.ts); `server-stt-native.ts` wires the real expo-audio recorder.
 *
 * Contract with the recognition pipeline:
 * - `onStart` once the first chunk is recording; `onEnd` only after `stop()` has flushed the last
 *   chunk and every upload settled, or after a fatal recorder error — never on its own otherwise,
 *   so the restart loop has nothing to restart every 100ms.
 * - A chunk that cannot be transcribed (offline, 429, 503, no consent…) is dropped and reported
 *   through `onGap(chunkDurationMs)`. Because uploads are sequential, the gap lands in transcript
 *   order, between the text of the chunks before and after it.
 * - The chunk file is deleted after its upload attempt, success or failure.
 */
/** A chunk shorter than this holds nothing worth an upload (stop pressed right after a rotation). */
const MIN_CHUNK_MS = 300;

type State = 'idle' | 'starting' | 'recording' | 'stopping';

export function createServerSttEngine(deps: ServerSttDeps): SttEngine {
  const chunkMs = deps.chunkMs ?? STT_CHUNK_MS;
  const meterIntervalMs = deps.meterIntervalMs ?? 150;
  const maxPending = deps.maxPendingChunks ?? 6;
  const subscribers = new Set<SttHandlers>();

  let state: State = 'idle';
  // Bumped by every accepted start(). Every queued operation captures the value it was created
  // under and does nothing once it changed, so a stale stop / rotation can never act on a later run.
  let epoch = 0;
  let stopRequested = false;
  let fatal = false; // an upload failed in a way that must stop this run
  let language = '';
  let upload: { ownerId: string; meetingId: string } | undefined;
  let chunkStartedAt = 0;
  let cancelRotation: (() => void) | null = null;
  let cancelMeter: (() => void) | null = null;
  let ops: Promise<void> = Promise.resolve(); // rotate / shutdown / fail, strictly one at a time
  let uploads: Promise<void> = Promise.resolve(); // sequential upload queue = transcript order
  let pending = 0;

  const emit = (fn: (h: SttHandlers) => void) => subscribers.forEach(fn);
  // A throwing subscriber must not wedge every later rotation / stop.
  const enqueueOp = (op: () => Promise<void>) => void (ops = ops.then(op).catch(() => undefined));
  const inState = (e: number, ...allowed: State[]) => e === epoch && allowed.includes(state);

  function cancelTimers() {
    cancelRotation?.();
    cancelMeter?.();
    cancelRotation = cancelMeter = null;
  }

  function enqueueUpload(e: number, uri: string, durationMs: number) {
    pending += 1;
    uploads = uploads
      .then(async () => {
        try {
          if (fatal) return; // another account is signed in: nothing more may be sent
          const text = (await deps.transcribe(uri, language, upload)).trim();
          if (text && e === epoch) emit((h) => h.onResult(text, true));
        } catch (error) {
          if (deps.isFatal?.(error)) {
            fatal = true;
            enqueueOp(() => fail(e, new ServerSttError('owner-changed', 'Signed-in user is not the meeting owner')));
          } else if (e === epoch) emit((h) => h.onGap?.(durationMs));
        } finally {
          pending -= 1;
          // Best effort: a file we cannot delete is purged when the app next opens (server-stt-native.ts).
          await deps.deleteFile(uri).catch(() => undefined);
        }
      })
      // A throwing subscriber must not poison the queue for every later chunk.
      .catch(() => undefined);
  }

  /** Stops the current chunk and hands it to the upload queue. */
  async function collectChunk(e: number) {
    const durationMs = deps.now() - chunkStartedAt;
    let uri: string | null = null;
    try {
      uri = await deps.recorder.finish();
    } catch {
      // The recorder could not close this chunk: its audio is lost.
    }
    if (!uri) emit((h) => h.onGap?.(durationMs));
    else if (durationMs < MIN_CHUNK_MS) void deps.deleteFile(uri).catch(() => undefined);
    else if (pending >= maxPending) {
      void deps.deleteFile(uri).catch(() => undefined);
      emit((h) => h.onGap?.(durationMs));
    } else enqueueUpload(e, uri, durationMs);
  }

  async function beginChunk() {
    await deps.recorder.begin();
    chunkStartedAt = deps.now();
  }

  function scheduleRotation(e: number) {
    cancelRotation = deps.schedule(() => enqueueOp(() => rotate(e)), chunkMs);
  }

  function pollMeter() {
    cancelMeter = deps.schedule(() => {
      const level = state === 'recording' ? deps.recorder.level() : null;
      if (level !== null) emit((h) => h.onVolume(dbfsToVolume(level)));
      pollMeter();
    }, meterIntervalMs);
  }

  async function rotate(e: number) {
    if (!inState(e, 'recording')) return;
    try {
      await collectChunk(e);
      await beginChunk();
    } catch (error) {
      await fail(e, error);
      return;
    }
    scheduleRotation(e);
  }

  /** Waits for the uploads, releases the microphone, then reports the end — once per run. */
  async function settle(e: number) {
    await uploads;
    deps.recorder.close();
    if (e !== epoch) return;
    state = 'idle';
    emit((h) => h.onEnd());
  }

  /** `stop()`: flush the chunk in progress, wait for its upload, then end. */
  async function shutdown(e: number) {
    if (!inState(e, 'recording', 'starting')) return;
    state = 'stopping';
    cancelTimers();
    await collectChunk(e);
    await settle(e);
  }

  async function fail(e: number, error: unknown) {
    if (!inState(e, 'recording', 'starting')) return;
    state = 'stopping';
    cancelTimers();
    const code = error instanceof ServerSttError ? error.code : 'audio-capture';
    emit((h) => h.onError(code, error instanceof Error ? error.message : 'Recorder failed'));
    await settle(e);
  }

  async function run(e: number, options: SttStartOptions) {
    try {
      try {
        if (options.upload) deps.verifyOwner?.(options.upload.ownerId);
      } catch {
        throw new ServerSttError('owner-changed', 'Signed-in user is not the meeting owner');
      }
      await deps.recorder.open({ volume: options.volume });
      await beginChunk();
    } catch (error) {
      await fail(e, error);
      return;
    }
    if (stopRequested) {
      await shutdown(e);
      return;
    }
    state = 'recording';
    emit((h) => h.onStart());
    scheduleRotation(e);
    if (options.volume) pollMeter();
  }

  return {
    // `interim` and `bluetooth` do not apply: there are no partials, and the OS picks the input.
    start(options) {
      if (state !== 'idle') return;
      state = 'starting';
      epoch += 1;
      stopRequested = false;
      fatal = false;
      language = options.lang;
      upload = options.upload;
      void run(epoch, options);
    },

    stop() {
      if (state === 'idle' || state === 'stopping' || stopRequested) return;
      stopRequested = true;
      cancelTimers();
      const e = epoch;
      if (state === 'recording') enqueueOp(() => shutdown(e));
    },

    subscribe(handlers) {
      subscribers.add(handlers);
      return () => void subscribers.delete(handlers);
    },
  };
}
