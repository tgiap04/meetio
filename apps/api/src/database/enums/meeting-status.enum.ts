/**
 * Lifecycle of a meeting recording/processing run.
 * Mirrors PG enum `meeting_status` (see docs/data-model.md §2).
 */
export enum MeetingStatus {
  RECORDING = 'recording',
  PAUSED = 'paused',
  ENDED = 'ended',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}
