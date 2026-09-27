import type { TranscriptSegmentPayload } from '@meetio/shared';
import type { SqlDb } from './queue-db';

/** A finalised segment before it has a seq — the queue assigns seqs, contiguous from 1. */
export type NewSegment = Omit<TranscriptSegmentPayload, 'seq'>;

interface Row {
  seq: number;
  text: string;
  started_at_ms: number;
  ended_at_ms: number;
  gap_before_ms: number | null;
}

const toPayload = (r: Row): TranscriptSegmentPayload => ({
  seq: r.seq,
  text: r.text,
  started_at_ms: r.started_at_ms,
  ended_at_ms: r.ended_at_ms,
  ...(r.gap_before_ms !== null ? { gap_before_ms: r.gap_before_ms } : {}),
});

/**
 * Writes the segment to disk and assigns its seq in ONE transaction — the seq counter and the row
 * can never disagree, even if the app dies between the two statements. Returns the seq.
 */
export async function enqueueSegment(db: SqlDb, meetingId: string, segment: NewSegment): Promise<number> {
  let seq = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE local_meetings SET last_seq = last_seq + 1 WHERE id = ?', [meetingId]);
    const row = await txn.getFirstAsync<{ last_seq: number }>('SELECT last_seq FROM local_meetings WHERE id = ?', [meetingId]);
    if (!row) throw new Error('enqueueSegment: unknown local meeting');
    seq = row.last_seq;
    await txn.runAsync(
      'INSERT INTO pending_segments (meeting_id, seq, text, started_at_ms, ended_at_ms, gap_before_ms) VALUES (?, ?, ?, ?, ?, ?)',
      [meetingId, seq, segment.text, segment.started_at_ms, segment.ended_at_ms, segment.gap_before_ms ?? null],
    );
  });
  return seq;
}

/** Oldest first, so the server receives them in order (US-14). */
export async function pendingSegments(db: SqlDb, meetingId: string, limit: number, afterSeq = 0): Promise<TranscriptSegmentPayload[]> {
  const rows = await db.getAllAsync<Row>(
    'SELECT seq, text, started_at_ms, ended_at_ms, gap_before_ms FROM pending_segments WHERE meeting_id = ? AND seq > ? ORDER BY seq LIMIT ?',
    [meetingId, afterSeq, limit],
  );
  return rows.map(toPayload);
}

export async function pendingSegmentsBySeq(db: SqlDb, meetingId: string, seqs: number[]): Promise<TranscriptSegmentPayload[]> {
  if (seqs.length === 0) return [];
  const rows = await db.getAllAsync<Row>(
    `SELECT seq, text, started_at_ms, ended_at_ms, gap_before_ms FROM pending_segments
     WHERE meeting_id = ? AND seq IN (${seqs.map(() => '?').join(',')}) ORDER BY seq`,
    [meetingId, ...seqs],
  );
  return rows.map(toPayload);
}

export async function countPending(db: SqlDb, meetingId?: string): Promise<number> {
  const row = meetingId
    ? await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM pending_segments WHERE meeting_id = ?', [meetingId])
    : await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM pending_segments');
  return row?.n ?? 0;
}

export async function countPendingForOwner(db: SqlDb, ownerId: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT count(*) AS n FROM pending_segments s JOIN local_meetings m ON m.id = s.meeting_id WHERE m.owner_id = ?',
    [ownerId],
  );
  return row?.n ?? 0;
}

/** Only on the server's ack — the data is durable in PostgreSQL, the local copy can go. */
export async function ackSegments(db: SqlDb, meetingId: string, seqs: number[]): Promise<void> {
  if (seqs.length === 0) return;
  await db.runAsync(`DELETE FROM pending_segments WHERE meeting_id = ? AND seq IN (${seqs.map(() => '?').join(',')})`, [
    meetingId,
    ...seqs,
  ]);
}
