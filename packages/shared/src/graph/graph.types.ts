/**
 * Knowledge graph: entities, relations, merges (US-38→41).
 * Source of truth: docs/api-spec.md §7 (`/entities`, `/meetings/:id/graph`).
 * Every endpoint only ever sees the caller's own graph; merged-away entities are hidden.
 */
import type { EntityType } from '../enums/entity-type';

export interface EntitySummary {
  id: string;
  canonical_name: string;
  type: EntityType;
  aliases: string[];
  mention_count: number;
  meeting_count: number;
  /** Start time (ISO 8601) of the latest meeting that mentions it; null if none recorded a start. */
  last_mentioned_at: string | null;
}

/** `GET /entities?type=&q=&limit=&offset=` — `type` may be a comma list (e.g. `organization,product,other`). */
export interface EntityListQuery {
  type?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface EntityListResponse {
  items: EntitySummary[];
  next_offset: number | null;
}

export interface EntityRef {
  id: string;
  canonical_name: string;
  type: EntityType;
}

/** One observed relation, seen from the entity being viewed. Each row cites the transcript that produced it. */
export interface EntityRelation {
  id: string;
  /** `outgoing`: this entity is the source (`this → relationship → other`). */
  direction: 'outgoing' | 'incoming';
  relationship: string;
  other: EntityRef;
  confidence: number;
  meeting_id: string;
  meeting_title: string;
  chunk_id: string;
  /** First transcript segment of the cited chunk — open the transcript at `?seq=`. */
  segment_seq: number;
}

export interface EntityMeeting {
  id: string;
  title: string;
  started_at: string | null;
  mention_count: number;
}

/** A merge into this entity that can still be undone (30 days). */
export interface EntityMergeRecord {
  id: string;
  merged_entity_id: string;
  merged_name: string;
  merged_at: string;
  undo_until: string;
}

export interface EntityDetail extends EntitySummary {
  description: string | null;
  is_user_edited: boolean;
  relations: EntityRelation[];
  meetings: EntityMeeting[];
  merges: EntityMergeRecord[];
}

/** `GET /entities/:id/timeline?limit=&offset=` — oldest meeting first, then transcript order (US-39). */
export interface EntityTimelineItem {
  meeting_id: string;
  meeting_title: string;
  meeting_date: string | null;
  chunk_id: string;
  segment_seq: number;
  surface_form: string;
  excerpt: string;
}

export interface EntityTimelineResponse {
  items: EntityTimelineItem[];
  next_offset: number | null;
}

/** `PATCH /entities/:id` — marks the entity user-edited: the pipeline never overwrites it again. */
export interface UpdateEntityRequest {
  canonical_name?: string;
  type?: EntityType;
}

export interface MergeSuggestion {
  id: string;
  /** Cosine similarity of the two entities' name/description embeddings, 0–1. */
  score: number;
  a: EntitySummary;
  b: EntitySummary;
}

export interface MergeSuggestionsResponse {
  items: MergeSuggestion[];
}

/** `POST /entities/merge` */
export interface MergeEntitiesRequest {
  keep_id: string;
  merge_ids: string[];
}

export interface MergeEntitiesResponse {
  entity: EntityDetail;
  /** One record per merged entity — pass its id to `POST /entities/merge/:id/undo`. */
  merges: EntityMergeRecord[];
}

/** `GET /meetings/:id/graph` — the part of the user's graph this meeting produced (screen 10). */
export interface MeetingGraphNode extends EntityRef {
  mention_count: number;
}

export interface MeetingGraphEdge {
  source_id: string;
  target_id: string;
  relationship: string;
  /** How many times this meeting stated the relation. */
  count: number;
  /** Citation of the first statement — open the transcript at `?seq=`. */
  chunk_id: string;
  segment_seq: number;
}

export interface MeetingGraphResponse {
  nodes: MeetingGraphNode[];
  edges: MeetingGraphEdge[];
}
