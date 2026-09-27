import type { SqlDb } from './queue-db';
import type { LocalMeetingStatus } from './local-meetings';

/**
 * Pause / resume / end, recorded with the instant the user pressed the button and replayed to
 * the server in order (the server clamps `at`, so paused time stays right however late the
 * replay). The local status flips in the same transaction, so the UI never waits on the network.
 */
export type LifecycleOp = 'pause' | 'resume' | 'end';

export interface PendingOp {
  id: number;
  meetingId: string;
  op: LifecycleOp;
  at: number;
  lastSeq: number | null;
}

interface Row {
  id: number;
  meeting_id: string;
  op: LifecycleOp;
  at: number;
  last_seq: number | null;
}

const NEXT_STATUS: Record<LifecycleOp, LocalMeetingStatus> = { pause: 'paused', resume: 'recording', end: 'ending' };

export async function recordOp(db: SqlDb, meetingId: string, op: LifecycleOp, at: number): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (op === 'pause') {
      await txn.runAsync('UPDATE local_meetings SET status = ?, paused_at = ? WHERE id = ?', ['paused', at, meetingId]);
    } else {
      // Resume and end both close an open pause into paused_ms (the elapsed clock excludes it).
      await txn.runAsync(
        `UPDATE local_meetings SET status = ?, paused_ms = paused_ms + CASE WHEN paused_at IS NULL THEN 0 ELSE max(0, ? - paused_at) END,
         paused_at = NULL WHERE id = ?`,
        [NEXT_STATUS[op], at, meetingId],
      );
    }
    // `end` carries the highest seq assigned at that instant — nothing is enqueued after it.
    await txn.runAsync(
      `INSERT INTO pending_ops (meeting_id, op, at, last_seq)
       VALUES (?, ?, ?, CASE WHEN ? = 'end' THEN (SELECT last_seq FROM local_meetings WHERE id = ?) END)`,
      [meetingId, op, at, op, meetingId],
    );
  });
}

export async function nextOp(db: SqlDb, meetingId: string): Promise<PendingOp | null> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM pending_ops WHERE meeting_id = ? ORDER BY id LIMIT 1', [meetingId]);
  return row ? { id: row.id, meetingId: row.meeting_id, op: row.op, at: row.at, lastSeq: row.last_seq } : null;
}

export async function removeOp(db: SqlDb, id: number): Promise<void> {
  await db.runAsync('DELETE FROM pending_ops WHERE id = ?', [id]);
}
