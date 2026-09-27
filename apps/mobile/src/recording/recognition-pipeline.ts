import type { AudioSource, RecordingQuality } from '@meetio/shared';
import type { NewSegment } from '../queue/segment-queue';
import { createRestartLoop, type Scheduler } from './restart-loop';
import { createSegmentAssembler } from './segment-assembler';
import { engineProblemMessage } from './engine-problems';
import type { SttEngine } from './stt-engine';

export interface PipelineSettings {
  language: string;
  audioSource: AudioSource;
  quality: RecordingQuality;
}

export interface RecognitionPipelineDeps {
  engine: SttEngine;
  now: () => number;
  schedule: Scheduler;
  meetingStartedAt: number;
  settings: PipelineSettings;
  onPartial(text: string | null): void;
  onSegment(segment: NewSegment): void;
  /** A problem the user must act on, or `null` once the engine is running again. */
  onProblem(message: string | null): void;
  onVolume(value: number): void;
}

/**
 * Engine events → restart loop → segment assembler, for one meeting. `high` quality asks for
 * word-by-word partials and input levels; `standard` only for finished sentences (US-43).
 */
export function createRecognitionPipeline(deps: RecognitionPipelineDeps) {
  const high = deps.settings.quality === 'high';
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
          interim: high,
          volume: high,
          bluetooth: deps.settings.audioSource === 'external_bluetooth',
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
      loop.handleStart();
      deps.onProblem(null);
    },
    onResult: (text, isFinal) => loop.handleResult(text, isFinal),
    onError: (code) => {
      const problem = engineProblemMessage(code);
      if (problem) deps.onProblem(problem);
      loop.handleError();
    },
    onEnd: () => loop.handleEnd(),
    onVolume: deps.onVolume,
  });

  return {
    listen() {
      assembler.markBoundary();
      loop.start();
    },
    /** Mic off; the utterance in progress is kept as a segment rather than lost. */
    silence() {
      loop.stop();
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
