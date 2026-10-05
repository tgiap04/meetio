import { STREAM_FAILED } from './server-stream-stt-ports';
import type { SttEngine, SttHandlers, SttStartOptions } from './stt-engine';

export interface FallbackSttDeps {
  /** The streaming engine, tried first. */
  primary: SttEngine;
  /** The chunked engine used when the stream cannot work. */
  secondary: SttEngine;
  now: () => number;
}

type State = 'idle' | 'primary' | 'switching' | 'secondary';

/** Dropping audio for less than this is not worth a "Gián đoạn" line. */
const MIN_GAP_MS = 500;

/**
 * Streaming first, chunked as the safety net (Phase 19). The streaming engine reports an
 * unusable stream with `onError('stream-failed')` + `onEnd`; this engine swallows those two and
 * starts the chunked engine with the same options, so the pipeline above sees one continuous
 * recording. It falls back at most once: after that the chunked engine runs until the recording
 * is stopped (a stop followed by an end re-arms the stream for the next start), so there is no
 * flapping between the two. Time with no engine running is reported as a gap.
 */
export function createFallbackSttEngine(deps: FallbackSttDeps): SttEngine {
  const subscribers = new Set<SttHandlers>();
  let state: State = 'idle';
  let fellBack = false;
  let stopRequested = false;
  let options: SttStartOptions | null = null;
  let failedAt = 0;

  const emit = (fn: (h: SttHandlers) => void) => subscribers.forEach(fn);
  const ended = () => {
    state = 'idle';
    if (stopRequested) fellBack = false; // a finished recording starts fresh next time
    emit((h) => h.onEnd());
  };

  function switchToSecondary() {
    if (stopRequested) {
      ended();
      return;
    }
    fellBack = true;
    state = 'secondary';
    deps.secondary.start(options!);
  }

  deps.primary.subscribe({
    onStart: () => state === 'primary' && emit((h) => h.onStart()),
    onResult: (text, isFinal) => state === 'primary' && emit((h) => h.onResult(text, isFinal)),
    onVolume: (value) => state === 'primary' && emit((h) => h.onVolume(value)),
    onGap: (ms) => state === 'primary' && emit((h) => h.onGap?.(ms)),
    onError: (code, message) => {
      if (state !== 'primary') return;
      if (code === STREAM_FAILED && !fellBack) {
        state = 'switching';
        failedAt = deps.now();
      } else emit((h) => h.onError(code, message));
    },
    onEnd: () => {
      if (state === 'switching') switchToSecondary();
      else if (state === 'primary') ended();
    },
  });

  deps.secondary.subscribe({
    onStart: () => {
      if (state !== 'secondary') return;
      const lost = failedAt ? deps.now() - failedAt : 0;
      failedAt = 0;
      if (lost >= MIN_GAP_MS) emit((h) => h.onGap?.(lost));
      emit((h) => h.onStart());
    },
    onResult: (text, isFinal) => state === 'secondary' && emit((h) => h.onResult(text, isFinal)),
    onVolume: (value) => state === 'secondary' && emit((h) => h.onVolume(value)),
    onGap: (ms) => state === 'secondary' && emit((h) => h.onGap?.(ms)),
    onError: (code, message) => state === 'secondary' && emit((h) => h.onError(code, message)),
    onEnd: () => state === 'secondary' && ended(),
  });

  return {
    start(opts) {
      if (state !== 'idle') return;
      options = opts;
      stopRequested = false;
      failedAt = 0;
      if (fellBack) {
        state = 'secondary';
        deps.secondary.start(opts);
      } else {
        state = 'primary';
        deps.primary.start(opts);
      }
    },

    stop() {
      if (state === 'idle' || stopRequested) return;
      stopRequested = true;
      if (state === 'primary') deps.primary.stop();
      else if (state === 'secondary') deps.secondary.stop();
      // 'switching': nothing is running; the primary's pending onEnd finishes the stop.
    },

    subscribe(handlers) {
      subscribers.add(handlers);
      return () => void subscribers.delete(handlers);
    },
  };
}
