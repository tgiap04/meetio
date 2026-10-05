import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openNodeSqliteDb } from './test-support/node-sqlite-db';
import { migrateQueueSchema } from './queue-db';
import { getLocalMeeting, insertLocalMeeting } from './local-meetings';

const BODY = { source_language: 'vi-VN', translate_to: null, audio_source: 'device_mic', recording_quality: 'high' } as const;

describe('a local meeting remembers how it is recognised (Phase 18)', () => {
  it('stores the mode it started with', async () => {
    const db = openNodeSqliteDb();
    await insertLocalMeeting(db, { id: 'a', ownerId: 'u1', startedAt: 1, createBody: BODY, recognitionMode: 'server' });
    await insertLocalMeeting(db, { id: 'b', ownerId: 'u1', startedAt: 2, createBody: BODY, recognitionMode: 'on_device' });
    expect((await getLocalMeeting(db, 'a'))?.recognitionMode).toBe('server');
    expect((await getLocalMeeting(db, 'b'))?.recognitionMode).toBe('on_device');
    db.close();
  });

  it('is null for a meeting adopted from the server, which has no local history', async () => {
    const db = openNodeSqliteDb();
    await insertLocalMeeting(db, { id: 'a', ownerId: 'u1', startedAt: 1, createBody: BODY });
    expect((await getLocalMeeting(db, 'a'))?.recognitionMode).toBeNull();
    db.close();
  });

  it('migrates a database from before Phase 18: the column appears and old meetings count as on-device', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'meetio-migrate-'));
    const path = join(dir, 'legacy.db');
    try {
      const legacy = new DatabaseSync(path);
      legacy.exec(`CREATE TABLE local_meetings (
        id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL,
        create_body TEXT NOT NULL, server_created INTEGER NOT NULL DEFAULT 0, last_seq INTEGER NOT NULL DEFAULT 0,
        paused_ms INTEGER NOT NULL DEFAULT 0, paused_at INTEGER, blocked TEXT);
        INSERT INTO local_meetings (id, owner_id, status, started_at, create_body) VALUES ('old', 'u1', 'recording', 1, '${JSON.stringify(BODY)}');`);
      legacy.close();

      const db = openNodeSqliteDb(path);
      await migrateQueueSchema(db);
      expect((await getLocalMeeting(db, 'old'))?.recognitionMode).toBe('on_device');
      await insertLocalMeeting(db, { id: 'new', ownerId: 'u1', startedAt: 2, createBody: BODY, recognitionMode: 'server' });
      expect((await getLocalMeeting(db, 'new'))?.recognitionMode).toBe('server');
      await migrateQueueSchema(db); // idempotent
      expect((await getLocalMeeting(db, 'new'))?.recognitionMode).toBe('server');
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
