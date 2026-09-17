/**
 * Execution state of an async meeting-processing job.
 * Mirrors PG enum `job_status` (see docs/data-model.md §6).
 */
export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}
