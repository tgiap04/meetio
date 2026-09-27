import type { CreateMeetingRequest } from '@meetio/shared';
import type { SqlDb } from './queue-db';

/**
 * A meeting this device is recording or has not finished syncing. It exists locally from the
 * first second — before the server knows about it — so an offline start (US-07) and a crash
 * (US-15) both have something to resume from. Deleted once `end` succeeds on the server.
 */
export type LocalMeetingStatus = 'recording' | 'paused' | 'ending';

export interface LocalMeeting {
  id: string;
  /** The signed-in user who recorded it — only their session may sync it (a shared phone must never
   * upload one person's meeting into another's account). */
  ownerId: string;
  status: LocalMeetingStatus;
  startedAt: number;
  createBody: CreateMeetingRequest;
  serverCreated: boolean;
  lastSeq: number;
  pausedMs: number;
  pausedAt: number | null;
  /** Server refused the meeting for good (e.g. CONSENT_REQUIRED) — sync stops until the user acts. */
  blocked: string | null;
}

interface Row {
  id: string;
  owner_id: string;
  status: LocalMeetingStatus;
  started_at: number;
  create_body: string;
  server_created: number;
  last_seq: number;
  paused_ms: number;
  paused_at: number | null;
  blocked: string | null;
}

const toMeeting = (r: Row): LocalMeeting => ({
  id: r.id,
  ownerId: r.owner_id,
  status: r.status,
  startedAt: r.started_at,
  createBody: JSON.parse(r.create_body) as CreateMeetingRequest,
  serverCreated: r.server_created === 1,
  lastSeq: r.last_seq,
  pausedMs: r.paused_ms,
  pausedAt: r.paused_at,
  blocked: r.blocked,
});

export async function insertLocalMeeting(
  db: SqlDb,
  m: Pick<LocalMeeting, 'id' | 'ownerId' | 'startedAt' | 'createBody'> & {
    serverCreated?: boolean;
    lastSeq?: number;
    status?: LocalMeetingStatus;
    pausedAt?: number | null;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_meetings (id, owner_id, status, started_at, create_body, server_created, last_seq, paused_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.id,
      m.ownerId,
      m.status ?? 'recording',
      m.startedAt,
      JSON.stringify(m.createBody),
      m.serverCreated ? 1 : 0,
      m.lastSeq ?? 0,
      m.pausedAt ?? null,
    ],
  );
}

export async function getLocalMeeting(db: SqlDb, id: string): Promise<LocalMeeting | null> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM local_meetings WHERE id = ?', [id]);
  return row ? toMeeting(row) : null;
}

/** One user's meetings, oldest first — the order they were started, which is the order they should sync. */
export async function listLocalMeetings(db: SqlDb, ownerId: string): Promise<LocalMeeting[]> {
  return (await db.getAllAsync<Row>('SELECT * FROM local_meetings WHERE owner_id = ? ORDER BY started_at', [ownerId])).map(toMeeting);
}

export async function markServerCreated(db: SqlDb, id: string): Promise<void> {
  await db.runAsync('UPDATE local_meetings SET server_created = 1 WHERE id = ?', [id]);
}

export async function markBlocked(db: SqlDb, id: string, code: string | null): Promise<void> {
  await db.runAsync('UPDATE local_meetings SET blocked = ? WHERE id = ?', [code, id]);
}

/** Continues seq numbering after a resume from the server's highest seq, never below what is local. */
export async function raiseLastSeq(db: SqlDb, id: string, seq: number): Promise<void> {
  await db.runAsync('UPDATE local_meetings SET last_seq = max(last_seq, ?) WHERE id = ?', [seq, id]);
}

export async function deleteLocalMeeting(db: SqlDb, id: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM pending_segments WHERE meeting_id = ?', [id]);
    await txn.runAsync('DELETE FROM pending_ops WHERE meeting_id = ?', [id]);
    await txn.runAsync('DELETE FROM local_meetings WHERE id = ?', [id]);
  });
}
