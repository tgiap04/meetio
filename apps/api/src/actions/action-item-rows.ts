import type { DataSource, EntityManager } from 'typeorm';
import type { ActionListItem, MeetingActionItem } from '@meetio/shared';
import { normalizeEntityName } from '../graph/name-normalizer.js';

/** Two tasks are "the same" when their text matches ignoring case, accents and punctuation. */
export const actionContentKey = (content: string) => normalizeEntityName(content, 'other');

/**
 * The one way an action item becomes wire JSON: with the assignee's name (the entity may have
 * been renamed or merged — merged-away entities resolve to the entity they were merged into) and
 * the transcript seq of its source chunk. `WHERE`/`ORDER` come from the caller; `a` is the item,
 * `m` its meeting.
 */
const SELECT = `
  SELECT a.id, a.meeting_id, a.content, a.status, a.is_manual, a.due_date::text AS due_date, a.created_at,
         COALESCE(keep.id, ae.id) AS assignee_entity_id, COALESCE(keep.canonical_name, ae.canonical_name) AS assignee_name,
         a.source_chunk_id, c.segment_start_seq AS segment_seq, m.title AS meeting_title, m.started_at AS meeting_date
  FROM action_items a
  JOIN meetings m ON m.id = a.meeting_id AND m.deleted_at IS NULL
  LEFT JOIN entities ae ON ae.id = a.assignee_entity_id
  LEFT JOIN entities keep ON keep.id = ae.merged_into_id
  LEFT JOIN meeting_chunks c ON c.id = a.source_chunk_id`;

/** Open before done; then by due date (none last), then oldest first. */
export const ACTION_ORDER = `ORDER BY (a.status = 'done'), a.due_date NULLS LAST, a.created_at, a.id`;

interface Row extends Omit<ActionListItem, 'created_at' | 'meeting_date'> {
  created_at: Date;
  meeting_date: Date | null;
}

export async function loadActionItems(db: DataSource | EntityManager, where: string, params: unknown[], tail = ACTION_ORDER): Promise<ActionListItem[]> {
  const rows = (await db.query(`${SELECT} WHERE ${where} ${tail}`, params)) as Row[];
  return rows.map((r) => ({
    ...r,
    created_at: new Date(r.created_at).toISOString(),
    meeting_date: r.meeting_date ? new Date(r.meeting_date).toISOString() : null,
  }));
}

/** Per-meeting lists do not repeat the meeting on every row. */
export const withoutMeeting = ({ meeting_title: _t, meeting_date: _d, ...item }: ActionListItem): MeetingActionItem => item;
