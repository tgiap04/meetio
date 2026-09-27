import { openDatabaseAsync } from 'expo-sqlite';

/**
 * The on-disk transcript queue (Phase 08, US-14/15). RAM dies with the app; every finalised segment
 * lands here in a transaction BEFORE anything is sent, and leaves only on the server's `segment_ack`.
 *
 * `SqlDb` is the slice of expo-sqlite's `SQLiteDatabase` the queue uses — tests run the same SQL on
 * Node's built-in `node:sqlite` through an adapter, so the queries are exercised for real.
 *
 * Backup: Android excludes app data via `allowBackup: false` (app.config.ts). iOS keeps expo-sqlite
 * databases under Documents, which iCloud backs up, and exposes no way to exclude a file — the
 * exposure is bounded to segments not yet acknowledged, which are deleted as soon as they sync.
 */
export type SqlParam = string | number | null;

export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  withExclusiveTransactionAsync(task: (txn: SqlDb) => Promise<void>): Promise<void>;
}

export const QUEUE_SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS local_meetings (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  create_body TEXT NOT NULL,
  server_created INTEGER NOT NULL DEFAULT 0,
  last_seq INTEGER NOT NULL DEFAULT 0,
  paused_ms INTEGER NOT NULL DEFAULT 0,
  paused_at INTEGER,
  blocked TEXT
);
CREATE TABLE IF NOT EXISTS pending_ops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT NOT NULL,
  op TEXT NOT NULL,
  at INTEGER NOT NULL,
  last_seq INTEGER
);
CREATE TABLE IF NOT EXISTS pending_segments (
  meeting_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  ended_at_ms INTEGER NOT NULL,
  gap_before_ms INTEGER,
  PRIMARY KEY (meeting_id, seq)
);
`;

let opening: Promise<SqlDb> | null = null;

/** One connection for the whole app (WAL + a single writer — no "database is locked"). */
export function openQueueDb(): Promise<SqlDb> {
  opening ??= openDatabaseAsync('meetio-queue.db').then(async (db) => {
    await db.execAsync(QUEUE_SCHEMA);
    return db as unknown as SqlDb;
  });
  return opening;
}
