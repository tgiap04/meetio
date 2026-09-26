/**
 * GraphRAG question answering (US-35→37, US-39).
 * Source of truth: docs/api-spec.md §6 (`/meetings/:id/qa`, `/qa`).
 */

/** `POST /meetings/:id/qa` — a question about one meeting. */
export interface AskMeetingRequest {
  question: string;
}

/** `POST /qa` — a question across the caller's meetings; filters apply to this question only. */
export interface AskGlobalRequest {
  question: string;
  /** ISO 8601 — meetings that started at or after. */
  from?: string;
  /** ISO 8601 — meetings that started at or before. */
  to?: string;
  /** Only context about this entity (US-39: "ask about this entity"). */
  entity_id?: string;
}

/** Where an answer came from. Tap → open the transcript at `segment_seq` (US-36). */
export interface QaCitation {
  chunk_id: string;
  meeting_id: string;
  meeting_title: string;
  meeting_date: string | null;
  segment_seq: number;
  excerpt: string;
  /** False when the cited passage no longer exists (the transcript was edited and re-cut since). */
  available: boolean;
}

export interface QaFilters {
  from: string | null;
  to: string | null;
  entity_id: string | null;
  entity_name: string | null;
}

export interface QaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Assistant only; empty for questions and for "not found". */
  citations: QaCitation[];
  /** Assistant only: 0–1. 0 when nothing relevant was found. */
  confidence: number | null;
  /** Assistant only: nothing in the meetings answers this — said plainly, the model was not asked to guess. */
  not_found: boolean;
  /** Assistant only: answered, but without solid sources — show a warning (US-36). */
  low_confidence: boolean;
  /** User message of a global question: the filters it was asked with. */
  filters: QaFilters | null;
  created_at: string;
}

export interface AskResponse {
  question: QaMessage;
  answer: QaMessage;
}

/** `GET /meetings/:id/qa` and `GET /qa?before=` — oldest first, the latest `limit` (default 50). */
export interface QaHistoryResponse {
  items: QaMessage[];
  /** Pass as `before` to load older messages; null when there are none. */
  next_before: string | null;
}
