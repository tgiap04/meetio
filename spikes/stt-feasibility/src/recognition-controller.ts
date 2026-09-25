// Vòng nhận diện tự khởi động lại — trái tim của spike.
// Không import gì từ React Native để test thẳng bằng `node --test` (Node tự bỏ kiểu TS).
// Recognizer thật được nối qua expo-recognizer-adapter.ts.

import type { LogSink } from './log-event.ts';

export const RESTART_DELAY_MS = 100;

export type RecognizerPort = {
  start(): void;
  stop(): void;
};

export type Scheduler = (fn: () => void, ms: number) => () => void;

export type ControllerDeps = {
  recognizer: RecognizerPort;
  log: LogSink;
  now: () => number;
  schedule: Scheduler;
  restartDelayMs?: number;
  // Lỗi mà không kèm sự kiện `end` thì phiên coi như đã chết sau khoảng này.
  errorWithoutEndMs?: number;
  // Gọi start() mà recognizer không báo `start` trong khoảng này → coi là khởi động thất bại.
  startTimeoutMs?: number;
  onStatus?: (status: ControllerStatus) => void;
};

export type ControllerStatus = {
  running: boolean;
  sessionId: string | null;
  restarts: number;
  lastText: string;
};

export function createRecognitionController(deps: ControllerDeps) {
  // US-11 đòi bật lại trong vòng 500ms tính từ lúc phiên chết, gồm cả thời gian engine khởi động.
  // Chờ sẵn 500ms là trượt chắc; 100ms là khoảng nghỉ đủ để Android không báo `recognizer busy`.
  const restartDelayMs = deps.restartDelayMs ?? RESTART_DELAY_MS;
  const errorWithoutEndMs = deps.errorWithoutEndMs ?? 1500;
  const startTimeoutMs = deps.startTimeoutMs ?? 5000;

  let running = false;
  let sessionCounter = 0;
  let sessionId: string | null = null;
  let sessionEnded = true;
  // Sự kiện native không mang id phiên. Từ lúc gọi start() tới khi recognizer báo `start`, mọi
  // `result` tới nơi đều là của phiên vừa chết — gắn cho phiên mới sẽ làm sai số chữ mất mỗi lần
  // restart. `error`/`end` thì vẫn nhận: đó là tín hiệu phiên mới khởi động thất bại.
  let awaitingStart = false;
  let restarts = 0;
  let consecutiveFailures = 0;
  let lastText = '';
  let cancelPending: (() => void) | null = null;

  const log = (event: Parameters<LogSink>[0]['event'], extra: Record<string, unknown> = {}) =>
    deps.log({
      event,
      timestamp: deps.now(),
      ...(sessionId ? { session_id: sessionId } : {}),
      ...extra,
    });
  const emitStatus = () => deps.onStatus?.({ running, sessionId, restarts, lastText });
  const clearPending = () => {
    cancelPending?.();
    cancelPending = null;
  };

  function launchSession(isRestart: boolean) {
    sessionCounter += 1;
    sessionId = `s${sessionCounter}`;
    sessionEnded = false;
    awaitingStart = true;
    if (isRestart) {
      restarts += 1;
      log('restart');
    }
    cancelPending = deps.schedule(() => endSession('auto_stop', 'start-timeout'), startTimeoutMs);
    try {
      deps.recognizer.start();
    } catch (err) {
      clearPending();
      endSession('auto_stop', `start-threw: ${err instanceof Error ? err.message : String(err)}`);
    }
    emitStatus();
  }

  // Phiên chết (tự ngắt, lỗi, hết giờ chờ) → ghi log rồi hẹn bật lại. Khởi động thất bại liên tiếp
  // thì giãn nhịp gấp đôi mỗi lần, tối đa 5s, để không xả hàng nghìn dòng log khi máy đã chặn hẳn micro.
  function endSession(event: 'auto_stop', reason?: string) {
    if (sessionEnded) return;
    sessionEnded = true;
    clearPending();
    if (reason) log('error', { error: reason });
    log(event);
    if (!running) return;
    const delay = Math.min(5000, restartDelayMs * 2 ** consecutiveFailures);
    consecutiveFailures += 1;
    cancelPending = deps.schedule(() => {
      cancelPending = null;
      if (running) launchSession(true);
    }, delay);
    emitStatus();
  }

  return {
    start() {
      if (running) return;
      running = true;
      launchSession(false);
    },

    stop() {
      if (!running) return;
      running = false;
      clearPending();
      if (!sessionEnded) {
        sessionEnded = true;
        log('user_stop');
        deps.recognizer.stop();
      }
      log('run_stop');
      emitStatus();
    },

    markPlayback() {
      deps.log({ event: 'mark_playback', timestamp: deps.now() });
    },

    handleStart() {
      if (sessionEnded || !awaitingStart) return;
      awaitingStart = false;
      clearPending();
      consecutiveFailures = 0;
      log('start');
    },

    handleResult(text: string, isFinal: boolean) {
      if (sessionEnded || awaitingStart) return;
      lastText = text;
      log(isFinal ? 'final' : 'partial', { text });
      emitStatus();
    },

    handleError(code: string, message: string) {
      if (sessionEnded) return;
      log('error', { error: code, message });
      clearPending();
      cancelPending = deps.schedule(
        () => endSession('auto_stop', 'error-without-end'),
        errorWithoutEndMs,
      );
    },

    handleEnd() {
      endSession('auto_stop');
    },
  };
}

export type RecognitionController = ReturnType<typeof createRecognitionController>;
