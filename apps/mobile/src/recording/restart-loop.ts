/**
 * The self-restarting recognition loop — the core of US-11, ported from the Phase 00 spike
 * (spikes/stt-feasibility/src/recognition-controller.ts, where it was tested adversarially).
 *
 * On-device engines WILL stop on their own (silence, session cap, OS interruption). Every death
 * is followed by a restart after 100ms (US-11 allows 500ms including engine start-up), backing
 * off ×2 up to 5s when starts keep failing. The loop also measures how long no audio was being
 * recognised — dead session → next `start` — and reports it, so the transcript can show the gap
 * instead of silently joining both sides (US-10).
 *
 * Pure: no React Native import, the engine and the clock are injected.
 */
export const RESTART_DELAY_MS = 100;

export interface RecognizerPort {
  start(): void;
  stop(): void;
}

export type Scheduler = (fn: () => void, ms: number) => () => void;

export interface RestartLoopDeps {
  recognizer: RecognizerPort;
  now: () => number;
  schedule: Scheduler;
  onPartial(text: string): void;
  onFinal(text: string): void;
  /** Recognition was down for `gapMs` (session died → next session started). */
  onGap(gapMs: number): void;
  /** A session ended (for any reason) while the loop is running. */
  onSessionEnd?(): void;
  onRestart?(count: number): void;
  restartDelayMs?: number;
  /** An `error` with no `end` after it means the session is dead after this long. */
  errorWithoutEndMs?: number;
  /** `start()` with no `start` event within this long counts as a failed start. */
  startTimeoutMs?: number;
}

export function createRestartLoop(deps: RestartLoopDeps) {
  const restartDelayMs = deps.restartDelayMs ?? RESTART_DELAY_MS;
  const errorWithoutEndMs = deps.errorWithoutEndMs ?? 1500;
  const startTimeoutMs = deps.startTimeoutMs ?? 5000;

  let running = false;
  let sessionEnded = true;
  // Native events carry no session id. Between start() and the engine's `start`, any `result`
  // belongs to the session that just died — attributing it to the new one would corrupt text.
  let awaitingStart = false;
  let restarts = 0;
  let consecutiveFailures = 0;
  let diedAt: number | null = null;
  let cancelPending: (() => void) | null = null;

  const clearPending = () => {
    cancelPending?.();
    cancelPending = null;
  };

  function launchSession(isRestart: boolean) {
    sessionEnded = false;
    awaitingStart = true;
    if (isRestart) {
      restarts += 1;
      deps.onRestart?.(restarts);
    }
    cancelPending = deps.schedule(() => endSession(), startTimeoutMs);
    try {
      deps.recognizer.start();
    } catch {
      clearPending();
      endSession();
    }
  }

  function endSession() {
    if (sessionEnded) return;
    sessionEnded = true;
    clearPending();
    if (!running) return;
    diedAt ??= deps.now();
    deps.onSessionEnd?.();
    const delay = Math.min(5000, restartDelayMs * 2 ** consecutiveFailures);
    consecutiveFailures += 1;
    cancelPending = deps.schedule(() => {
      cancelPending = null;
      if (running) launchSession(true);
    }, delay);
  }

  return {
    start() {
      if (running) return;
      running = true;
      diedAt = null;
      consecutiveFailures = 0;
      launchSession(false);
    },

    /** User stop / pause: not an interruption, so no gap is recorded. */
    stop() {
      if (!running) return;
      running = false;
      clearPending();
      diedAt = null;
      if (!sessionEnded) {
        sessionEnded = true;
        deps.recognizer.stop();
      }
    },

    handleStart() {
      if (sessionEnded || !awaitingStart) return;
      awaitingStart = false;
      clearPending();
      consecutiveFailures = 0;
      if (diedAt !== null) {
        deps.onGap(deps.now() - diedAt);
        diedAt = null;
      }
    },

    handleResult(text: string, isFinal: boolean) {
      if (sessionEnded || awaitingStart) return;
      if (isFinal) deps.onFinal(text);
      else deps.onPartial(text);
    },

    handleError() {
      if (sessionEnded) return;
      clearPending();
      cancelPending = deps.schedule(() => endSession(), errorWithoutEndMs);
    },

    handleEnd() {
      endSession();
    },

    get restarts() {
      return restarts;
    },
  };
}

export type RestartLoop = ReturnType<typeof createRestartLoop>;
