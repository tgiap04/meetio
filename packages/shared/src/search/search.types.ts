/**
 * Semantic search across meetings (US-22).
 * Source of truth: docs/api-spec.md §6 (`GET /search`).
 */

/** `GET /search?q=&from=&to=&limit=&offset=` — `from`/`to` bound the meeting's start time (ISO 8601). */
export interface SearchQuery {
  q: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResultItem {
  chunk_id: string;
  meeting_id: string;
  meeting_title: string;
  /** Meeting start time, ISO 8601; null for a meeting that never recorded a start. */
  meeting_date: string | null;
  /** Leading part of the matching passage. */
  excerpt: string;
  /** First segment of the passage — open the transcript here. */
  segment_seq: number;
  segment_end_seq: number;
  /** Cosine similarity in [0, 1]; higher is closer. */
  score: number;
}

export interface SearchResponse {
  items: SearchResultItem[];
  /** Pass as `offset` for the next page; null when there is no more. */
  next_offset: number | null;
}
