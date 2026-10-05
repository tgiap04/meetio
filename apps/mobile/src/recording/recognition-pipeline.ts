import type { AudioSource, RecordingQuality } from '@meetio/shared';
import type { NewSegment } from '../queue/segment-queue';
import { createRestartLoop, type Scheduler } from './restart-loop';
import { createSegmentAssembler } from './segment-assembler';
import { engineProblemMessage } from './engine-problems';
import type { RecognitionMode, SttEngine } from './stt-engine';

export interface PipelineSettings {
  language: string;
  audioSource: AudioSource;
  quality: RecordingQuality;
}

export interface RecognitionPipelineDeps {
  engine: SttEngine;
  mode: RecognitionMode;
  now: () => number;
  schedule: Scheduler;
  meetingStartedAt: number;
  settings: PipelineSettings;
  /** Passed to the server engine so uploads carry the meeting's owner and id. */
  upload?: { ownerId: string; meetingId: string };
  onPartial(text: string | null): void;
  onSegment(segment: NewSegment): void;
  /** A problem the user must act on, or `null` once the engine is running again. */
  onProblem(message: string | null): void;
  onVolume(value: number): void;
}

/**
 * A server-mode `silence()` waits at most this long for the engine to flush its last chunk
 * (upload timeout 30s + slack) — a stuck upload must not freeze Pause / End.
 */
const SERVER_DRAIN_TIMEOUT_MS = 40_000;

/**
 * Engine events → restart loop → segment assembler, for one meeting. `high` quality asks for
 * word-by-word partials and input levels; `standard` only for finished sentences (US-43).
 *
 * Server mode (Phases 18-19): the engine never dies on its own, so the loop only supervises its
 * start and end. Results bypass the loop — it drops results once stopped, but the server engine
 * delivers its last text AFTER `stop()` — and go straight to the assembler, as do lost-audio gaps.
 * The chunked engine yields finals only; the streaming one also yields partials when `high`
 * quality asks for them (`interim`).
 */
export function createRecognitionPipeline(deps: RecognitionPipelineDeps) {
  const high = deps.settings.quality === 'high';
  const server = deps.mode === 'server';
  let engineRunning = false;
  const drainWaiters = new Set<() => void>(); // every concurrent silence() waits for the same end
  const assembler = createSegmentAssembler({
    now: deps.now,
    meetingStartedAt: deps.meetingStartedAt,
    onPartial: deps.onPartial,
    onSegment: deps.onSegment,
  });
  const loop = createRestartLoop({
    recognizer: {
      start: () =>
        deps.engine.start({
          lang: deps.settings.language,
          // The chunked server engine ignores `interim`; the streaming one (Phase 19) honours it.
          interim: high,
          volume: high,
          bluetooth: deps.settings.audioSource === 'external_bluetooth',
          ...(server && deps.upload ? { upload: deps.upload } : {}),
        }),
      stop: () => deps.engine.stop(),
    },
    now: deps.now,
    schedule: deps.schedule,
    onPartial: (text) => assembler.partial(text),
    onFinal: (text) => assembler.final(text),
    onGap: (ms) => assembler.gap(ms),
    onSessionEnd: () => assembler.flush(),
  });
  const unsubscribe = deps.engine.subscribe({
    onStart: () => {
      engineRunning = true;
      loop.handleStart();
      deps.onProblem(null);
    },
    onResult: (text, isFinal) => {
      if (!server) loop.handleResult(text, isFinal);
      else if (isFinal) assembler.final(text);
      else assembler.partial(text);
    },
    onError: (code) => {
      const problem = engineProblemMessage(code);
      if (problem) deps.onProblem(problem);
      loop.handleError();
    },
    onEnd: () => {
      engineRunning = false;
      [...drainWaiters].forEach((done) => done());
      loop.handleEnd();
    },
    onVolume: deps.onVolume,
    onGap: (ms) => assembler.gap(ms),
  });

  /** Resolves once a running server engine has delivered its last text and ended. */
  function drained(): Promise<void> {
    if (!server || !engineRunning) return Promise.resolve();
    return new Promise((resolve) => {
      const cancel = deps.schedule(() => done(), SERVER_DRAIN_TIMEOUT_MS);
      function done() {
        cancel();
        drainWaiters.delete(done);
        resolve();
      }
      drainWaiters.add(done);
    });
  }

  return {
    listen() {
      assembler.markBoundary();
      loop.start();
    },
    /**
     * Mic off; the utterance in progress is kept as a segment rather than lost. In server mode
     * this also waits for the last chunk's transcript.
     */
    async silence() {
      const done = drained();
      loop.stop();
      await done;
      assembler.flush();
    },
    /** Time nothing was recognised (e.g. the app was dead) — shown before the next segment. */
    gap(ms: number) {
      assembler.gap(ms);
    },
    dispose() {
      loop.stop();
      unsubscribe();
    },
  };
}

export type RecognitionPipeline = ReturnType<typeof createRecognitionPipeline>;
