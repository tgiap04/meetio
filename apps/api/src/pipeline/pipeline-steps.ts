import { ProcessingStep } from '@meetio/shared';

/** Pipeline order (docs/system-architecture.md §3). Each step is its own job, retried on its own. */
export const STEP_ORDER: readonly ProcessingStep[] = [
  ProcessingStep.CHUNK,
  ProcessingStep.EMBED,
  ProcessingStep.EXTRACT,
  ProcessingStep.RESOLVE,
  ProcessingStep.SUMMARIZE,
];

export const RUN_QUEUE = 'meeting-processing';
export const stepQueueName = (step: ProcessingStep) => `pipeline-${step}`;

/** "Retry up to 3 times with growing waits" (US-29): 1 attempt + 3 retries, waits 2s → 8s → 32s. */
export const STEP_ATTEMPTS = 4;
export const DEFAULT_RETRY_BASE_MS = 2000;
export const retryDelayMs = (attemptsMade: number, baseMs: number) => baseMs * 4 ** Math.max(0, attemptsMade - 1);

export const DEFAULT_STEP_TIMEOUT_MS = 10 * 60 * 1000;

export const runJobId = (meetingId: string, run: number) => `${meetingId}-r${run}`;
export const stepJobId = (meetingId: string, run: number, step: ProcessingStep) => `${meetingId}-r${run}-${step}`;

export interface RunJobData {
  meeting_id: string;
  /** Absent on jobs enqueued before runs existed — treated as the meeting's current run. */
  run?: number;
}

export interface StepJobData {
  meeting_id: string;
  run: number;
  step: ProcessingStep;
}
