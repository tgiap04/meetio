/**
 * Post-processing pipeline step for a meeting.
 * Source of truth: docs/data-model.md `processing_jobs.step`.
 */
export const ProcessingStep = {
  CHUNK: 'chunk',
  EMBED: 'embed',
  EXTRACT: 'extract',
  RESOLVE: 'resolve',
  SUMMARIZE: 'summarize',
} as const;

export type ProcessingStep = (typeof ProcessingStep)[keyof typeof ProcessingStep];

/**
 * Status of an individual processing job (one row per meeting + step).
 * Source of truth: docs/data-model.md `processing_jobs.status`.
 */
export const ProcessingJobStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

export type ProcessingJobStatus = (typeof ProcessingJobStatus)[keyof typeof ProcessingJobStatus];
