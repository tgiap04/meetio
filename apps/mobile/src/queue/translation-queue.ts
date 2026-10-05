import type { SqlDb } from './queue-db';

/**
 * Translations made on the phone, waiting to be stored with their segment on the server (Phase 21).
 * A row leaves on the server's 204; a `dropped` row (the server refused it for good) stays until its
 * meeting is deleted, so the worker never sends it again.
 */
export interface PendingTranslation {
  meetingId: string;
  seq: number;
  text: string;
  translatedTo: string;
  /** How many times the server answered "no such segment" (404). */
  attempts: number;
}

interface Row {
  meeting_id: string;
  seq: number;
  text: string;
  translated_to: string;
  attempts: number;
}

const toPending = (r: Row): PendingTranslation => ({ meetingId: r.meeting_id, seq: r.seq, text: r.text, translatedTo: r.translated_to, attempts: r.attempts });
const COLUMNS = 'meeting_id, seq, text, translated_to, attempts';

export async function upsertTranslation(db: SqlDb, meetingId: string, seq: number, text: string, translatedTo: string): Promise<void> {
  await db.runAsync(
    // Only while the meeting is still local: after `end` synced, a late result must not leave an orphan row.
    `INSERT INTO pending_translations (meeting_id, seq, text, translated_to, state, attempts)
     SELECT ?, ?, ?, ?, 'pending', 0 WHERE EXISTS (SELECT 1 FROM local_meetings WHERE id = ?)
     ON CONFLICT (meeting_id, seq) DO UPDATE SET text = excluded.text, translated_to = excluded.translated_to, state = 'pending', attempts = 0`,
    [meetingId, seq, text, translatedTo, meetingId],
  );
}

/** Every translation not yet on the server — what a resumed recording shows again. */
export async function listUnsyncedTranslations(db: SqlDb, meetingId: string): Promise<PendingTranslation[]> {
  const rows = await db.getAllAsync<Row>(`SELECT ${COLUMNS} FROM pending_translations WHERE meeting_id = ? AND state = 'pending' ORDER BY seq`, [meetingId]);
  return rows.map(toPending);
}

/** Only for segments the server already holds: a translation cannot attach to a row that does not exist yet. */
export async function syncableTranslations(db: SqlDb, meetingId: string, limit: number): Promise<PendingTranslation[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT t.meeting_id, t.seq, t.text, t.translated_to, t.attempts FROM pending_translations t
     WHERE t.meeting_id = ? AND t.state = 'pending'
       AND NOT EXISTS (SELECT 1 FROM pending_segments s WHERE s.meeting_id = t.meeting_id AND s.seq = t.seq)
     ORDER BY t.seq LIMIT ?`,
    [meetingId, limit],
  );
  return rows.map(toPending);
}

export async function countUnsyncedTranslations(db: SqlDb, meetingId?: string): Promise<number> {
  const row = meetingId
    ? await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM pending_translations WHERE meeting_id = ? AND state = 'pending'", [meetingId])
    : await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM pending_translations WHERE state = 'pending'");
  return row?.n ?? 0;
}

export async function countUnsyncedTranslationsForOwner(db: SqlDb, ownerId: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT count(*) AS n FROM pending_translations t JOIN local_meetings m ON m.id = t.meeting_id WHERE m.owner_id = ? AND t.state = 'pending'",
    [ownerId],
  );
  return row?.n ?? 0;
}

/** On the server's 204 — what was SENT is durable there; a newer text that replaced the row meanwhile stays. */
export async function removeTranslation(db: SqlDb, meetingId: string, seq: number, sentText: string): Promise<void> {
  await db.runAsync('DELETE FROM pending_translations WHERE meeting_id = ? AND seq = ? AND text = ?', [meetingId, seq, sentText]);
}

/** The server refused it for good (400): kept as a marker, never sent again. */
export async function dropTranslation(db: SqlDb, meetingId: string, seq: number): Promise<void> {
  await db.runAsync("UPDATE pending_translations SET state = 'dropped' WHERE meeting_id = ? AND seq = ?", [meetingId, seq]);
}

/** Records one more "no such segment" answer and returns the new count. */
export async function bumpTranslationAttempts(db: SqlDb, meetingId: string, seq: number): Promise<number> {
  await db.runAsync('UPDATE pending_translations SET attempts = attempts + 1 WHERE meeting_id = ? AND seq = ?', [meetingId, seq]);
  const row = await db.getFirstAsync<{ attempts: number }>('SELECT attempts FROM pending_translations WHERE meeting_id = ? AND seq = ?', [meetingId, seq]);
  return row?.attempts ?? 0;
}
