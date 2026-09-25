import type { MeetingStatus } from '../enums/meeting-status';
import type { ProcessingJobStatus, ProcessingStep } from '../enums/processing-step';

/**
 * Pipeline control and status contracts.
 * Source of truth: docs/api-spec.md §3 (`/status`, `/reindex`, `/export`).
 */

/**
 * `POST /meetings/:id/reindex`.
 * - `changed`: after transcript edits on a `ready` meeting, re-process only what the edits touch;
 *   after a failure, resume from the failed step (succeeded steps are skipped — US-29).
 * - `full`: re-run every step from scratch.
 */
export interface ReindexMeetingRequest {
  scope: 'changed' | 'full';
}

export interface MeetingStepStatus {
  step: ProcessingStep;
  status: ProcessingJobStatus;
  attempts: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

/** `GET /meetings/:id/status` — detailed per-step state (US-28). */
export interface MeetingStatusResponse {
  meeting_id: string;
  status: MeetingStatus;
  /** The step running now, or the step the pipeline is waiting on / failed at. */
  current_step: ProcessingStep | null;
  steps: MeetingStepStatus[];
  failure_reason: string | null;
  /** Transcript edited since the last completed run — the summary shown is from before the edits. */
  has_unprocessed_edits: boolean;
}

/** `GET /meetings/:id/export` query. `html` feeds on-device PDF rendering (expo-print). */
export interface ExportMeetingQuery {
  format: 'markdown' | 'html';
  /** Comma list; defaults to all four. */
  include?: string;
}

export const EXPORT_SECTIONS = ['summary', 'actions', 'transcript', 'translation'] as const;
export type ExportSection = (typeof EXPORT_SECTIONS)[number];
