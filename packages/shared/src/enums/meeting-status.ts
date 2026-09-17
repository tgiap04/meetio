/**
 * Meeting lifecycle status.
 * Source of truth: docs/data-model.md `meetings.status` and docs/api-spec.md §3.
 *
 * Flow: recording -> paused -> recording -> ended -> queued -> processing -> ready
 *       any post-ended step may terminate in `failed`.
 */
export const MeetingStatus = {
  RECORDING: 'recording',
  PAUSED: 'paused',
  ENDED: 'ended',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
} as const;

export type MeetingStatus = (typeof MeetingStatus)[keyof typeof MeetingStatus];
