/**
 * Summaries and action items (US-31→34).
 * Source of truth: docs/api-spec.md §5 (Kết quả AI).
 */
import type { ActionStatus } from '../enums/action-status';
import type { MeetingActionItem } from '../meetings/meetings.types';

/** One cited line of a summary — every line leads back to the transcript (US-31). */
export interface SummaryCitation {
  kind: 'point' | 'decision';
  text: string;
  chunk_ids: string[];
  /** First segment of the first cited chunk — open the transcript at `?seq=`. */
  segment_seq: number;
}

/** `GET /meetings/:id/summary` */
export interface MeetingSummaryResponse {
  meeting_id: string;
  /** Null until the summarize step has run. */
  summary: string | null;
  /** The meeting was too short or empty to summarize — `summary` says so; there are no points. */
  insufficient: boolean;
  points: SummaryCitation[];
  decisions: SummaryCitation[];
  /** Transcript edited since the summary was made (US-24). */
  has_unprocessed_edits: boolean;
}

/** An action item in the cross-meeting list (US-34) — knows its meeting. */
export interface ActionListItem extends MeetingActionItem {
  meeting_title: string;
  meeting_date: string | null;
}

/** `GET /actions?status=&assignee_entity_id=&meeting_id=&limit=&offset=` — open first, done last. */
export interface ActionListQuery {
  status?: ActionStatus;
  assignee_entity_id?: string;
  meeting_id?: string;
  limit?: number;
  offset?: number;
}

export interface ActionListResponse {
  items: ActionListItem[];
  next_offset: number | null;
}

/** A person who has open items, for the filter. */
export interface ActionAssignee {
  id: string;
  canonical_name: string;
  open_count: number;
}

/** A meeting that has open items, for the filter. */
export interface ActionMeetingOption {
  id: string;
  title: string;
  started_at: string | null;
  open_count: number;
}

/** `GET /actions/filters` — the to-do screen's filter chips and the exact open count (Home row). */
export interface ActionFiltersResponse {
  /** Every open item, assigned or not. */
  open_total: number;
  assignees: ActionAssignee[];
  meetings: ActionMeetingOption[];
}

/** `POST /meetings/:id/actions` — a task the AI missed (US-32). */
export interface CreateActionItemRequest {
  content: string;
  assignee_entity_id?: string | null;
  /** YYYY-MM-DD */
  due_date?: string | null;
}

/** `PATCH /actions/:id` — any change marks the item user-edited, so re-runs keep it. `null` clears a field. */
export interface UpdateActionItemRequest {
  content?: string;
  assignee_entity_id?: string | null;
  due_date?: string | null;
  status?: ActionStatus;
}
