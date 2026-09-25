import type { DataSource, EntityManager } from 'typeorm';

/**
 * Has the transcript been corrected since the current summary's run started?
 * Drives the "đang cập nhật" label (US-24) and decides whether a `changed`
 * reindex has anything to do. A meeting that never ran counts every edit.
 */
export async function hasUnprocessedEdits(db: DataSource | EntityManager, meetingId: string): Promise<boolean> {
  const [row] = (await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM transcript_segments s JOIN meetings m ON m.id = s.meeting_id
       WHERE s.meeting_id = $1 AND s.edited_at > COALESCE(m.pipeline_started_at, '-infinity')
     ) AS edited`,
    [meetingId],
  )) as { edited: boolean }[];
  return row.edited;
}
