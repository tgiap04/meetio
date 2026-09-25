import { DEFAULT_RETRY_BASE_MS, DEFAULT_STEP_TIMEOUT_MS, retryDelayMs } from './pipeline-steps.js';

const positive = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Read once, at module load: BullMQ's backoff strategy is fixed when the
 * worker is created by the @Processor decorator, before any DI container exists.
 * Env knobs exist for tests and ops; production uses the defaults (2s/8s/32s, 10 min).
 */
export const RETRY_BASE_MS = positive(process.env.PIPELINE_RETRY_BASE_MS, DEFAULT_RETRY_BASE_MS);
export const STEP_TIMEOUT_MS = positive(process.env.PIPELINE_STEP_TIMEOUT_MS, DEFAULT_STEP_TIMEOUT_MS);

/** Jobs one API process runs at once per step queue (different meetings in parallel). */
export const STEP_CONCURRENCY = positive(process.env.PIPELINE_STEP_CONCURRENCY, 4);

export const stepWorkerOptions = {
  concurrency: STEP_CONCURRENCY,
  settings: { backoffStrategy: (attemptsMade: number) => retryDelayMs(attemptsMade, RETRY_BASE_MS) },
};
