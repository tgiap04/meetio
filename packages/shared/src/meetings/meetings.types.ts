import type { SummaryCitation } from '../actions/actions.types';
import type { AudioSource } from '../enums/audio-source';
import type { RecordingQuality } from '../enums/recording-quality';
import type { MeetingStatus } from '../enums/meeting-status';
import type { ActionStatus } from '../enums/action-status';
import type { ProcessingJobStatus, ProcessingStep } from '../enums/processing-step';

/**
 * Meeting lifecycle request/response contracts.
 * Source of truth: docs/api-spec.md §3 (Vòng đời cuộc họp).
 */

/** `POST /meetings` — called when the user presses Start, before the mic opens. */
export interface CreateMeetingRequest {
  title?: string;
  source_language: string;
  translate_to?: string | null;
  audio_source: AudioSource;
  recording_quality: RecordingQuality;
}

export interface CreateMeetingResponse {
  id: string;
  status: MeetingStatus;
  started_at: string;
}

/**
 * `POST /meetings/:id/end`. `last_seq` is the highest `seq` the client assigned;
 * seqs are contiguous from 1, so the server can name exactly which ones it is missing.
 * Omitted means the meeting produced no segments.
 */
export interface EndMeetingRequest {
  last_seq?: number;
}

/** `details` of a `409 SEGMENTS_PENDING` — what the client still has to resend. */
export interface SegmentsPendingDetails {
  missing_count: number;
  /** At most the first 100 missing seqs, ascending. */
  missing_seqs: number[];
}

/** Returned by pause / resume / end. */
export interface MeetingStateResponse {
  id: string;
  status: MeetingStatus;
  duration_sec: number | null;
}

/** `PATCH /meetings/:id`. A blank `title` reverts to the default time-based title (US-25). */
export interface UpdateMeetingRequest {
  title?: string;
  translate_to?: string | null;
}

/** `GET /meetings` query. `from`/`to` bound `created_at`, ISO 8601. */
export interface ListMeetingsQuery {
  q?: string;
  from?: string;
  to?: string;
  status?: MeetingStatus;
  limit?: number;
  cursor?: string;
}

export interface MeetingListItem {
  id: string;
  title: string;
  status: MeetingStatus;
  source_language: string;
  translate_to: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  created_at: string;
}

export interface ListMeetingsResponse {
  items: MeetingListItem[];
  next_cursor: string | null;
}

export interface MeetingActionItem {
  id: string;
  meeting_id: string;
  content: string;
  assignee_entity_id: string | null;
  /** Canonical name of the assignee entity; null when nobody was clearly named (never guessed — US-32). */
  assignee_name: string | null;
  /** YYYY-MM-DD */
  due_date: string | null;
  status: ActionStatus;
  is_manual: boolean;
  /** Transcript the item came from; null for manual items or a source since re-cut. */
  source_chunk_id: string | null;
  segment_seq: number | null;
  created_at: string;
}

export interface MeetingProcessingStep {
  step: ProcessingStep;
  status: ProcessingJobStatus;
  attempts: number;
  error_message: string | null;
}

/** `GET /meetings/:id` — everything except the segments themselves. */
export interface MeetingDetailResponse extends MeetingListItem {
  audio_source: AudioSource;
  recording_quality: RecordingQuality;
  summary: string | null;
  summary_citations: SummaryCitation[] | null;
  /** Too short or empty to summarize — `summary` says so. */
  summary_insufficient: boolean;
  failure_reason: string | null;
  segment_count: number;
  action_items: MeetingActionItem[];
  processing_steps: MeetingProcessingStep[];
  /** Transcript edited since the last completed pipeline run — show the summary with an "updating" label (US-24). */
  has_unprocessed_edits: boolean;
  updated_at: string;
}
