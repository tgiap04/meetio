import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openNodeSqliteDb } from './test-support/node-sqlite-db';
import { migrateQueueSchema } from './queue-db';
import { deleteLocalMeeting, insertLocalMeeting } from './local-meetings';
import { ackSegments, enqueueSegment } from './segment-queue';
import {
  bumpTranslationAttempts,
  countUnsyncedTranslations,
  dropTranslation,
  listUnsyncedTranslations,
  removeTranslation,
  syncableTranslations,
  upsertTranslation,
} from './translation-queue';

const BODY = { source_language: 'vi-VN', translate_to: 'en-US', audio_source: 'device_mic', recording_quality: 'high' } as const;
const seg = (text: string) => ({ text, started_at_ms: 0, ended_at_ms: 900 });

describe('pending_translations (real SQLite)', () => {
  let db: ReturnType<typeof openNodeSqliteDb>;
  beforeEach(async () => {
    db = openNodeSqliteDb();
    await insertLocalMeeting(db, { id: 'm1', ownerId: 'u1', startedAt: 1, createBody: BODY });
    await enqueueSegment(db, 'm1', seg('một'));
    await enqueueSegment(db, 'm1', seg('hai'));
  });
  afterEach(() => db.close());

  it('stores one translation per seq — a later one for the same seq replaces it and resets the state', async () => {
    await upsertTranslation(db, 'm1', 1, 'one', 'en-US');
    await dropTranslation(db, 'm1', 1);
    await upsertTranslation(db, 'm1', 1, 'first', 'en-US');
    expect(await listUnsyncedTranslations(db, 'm1')).toEqual([{ meetingId: 'm1', seq: 1, text: 'first', translatedTo: 'en-US', attempts: 0 }]);
  });

  it('offers a translation for syncing only once its segment is acked (the server has no row to attach it to before)', async () => {
    await upsertTranslation(db, 'm1', 1, 'one', 'en-US');
    await upsertTranslation(db, 'm1', 2, 'two', 'en-US');
    expect(await syncableTranslations(db, 'm1', 10)).toEqual([]);
    await ackSegments(db, 'm1', [2]);
    expect((await syncableTranslations(db, 'm1', 10)).map((t) => t.seq)).toEqual([2]);
    await ackSegments(db, 'm1', [1]);
    expect((await syncableTranslations(db, 'm1', 10)).map((t) => t.seq)).toEqual([1, 2]);
    expect(await syncableTranslations(db, 'm1', 1)).toHaveLength(1);
  });

  it('counts unsynced translations (acked or not) until they are removed; dropped ones no longer count', async () => {
    await upsertTranslation(db, 'm1', 1, 'one', 'en-US');
    await upsertTranslation(db, 'm1', 2, 'two', 'en-US');
    expect(await countUnsyncedTranslations(db, 'm1')).toBe(2);
    await removeTranslation(db, 'm1', 1, 'one');
    await dropTranslation(db, 'm1', 2);
    expect(await countUnsyncedTranslations(db, 'm1')).toBe(0);
    expect(await countUnsyncedTranslations(db)).toBe(0);
  });

  it('counts attempts and leaves other meetings alone', async () => {
    await insertLocalMeeting(db, { id: 'm2', ownerId: 'u1', startedAt: 2, createBody: BODY });
    await upsertTranslation(db, 'm1', 1, 'one', 'en-US');
    await upsertTranslation(db, 'm2', 1, 'uno', 'en-US');
    expect(await bumpTranslationAttempts(db, 'm1', 1)).toBe(1);
    expect(await bumpTranslationAttempts(db, 'm1', 1)).toBe(2);
    expect((await listUnsyncedTranslations(db, 'm2'))[0].attempts).toBe(0);
    expect(await countUnsyncedTranslations(db)).toBe(2);
  });

  it('is deleted with its meeting', async () => {
    await upsertTranslation(db, 'm1', 1, 'one', 'en-US');
    await deleteLocalMeeting(db, 'm1');
    expect(await countUnsyncedTranslations(db)).toBe(0);
  });
});

describe('pending_translations guards (real SQLite)', () => {
  let db: ReturnType<typeof openNodeSqliteDb>;
  beforeEach(async () => {
    db = openNodeSqliteDb();
    await insertLocalMeeting(db, { id: 'm1', ownerId: 'u1', startedAt: 1, createBody: BODY });
  });
  afterEach(() => db.close());

  it('writes nothing for a meeting that no longer exists locally (no orphan rows after end)', async () => {
    await upsertTranslation(db, 'gone', 1, 'x', 'en-US');
    expect(await countUnsyncedTranslations(db)).toBe(0);
    await upsertTranslation(db, 'm1', 1, 'x', 'en-US');
    expect(await countUnsyncedTranslations(db)).toBe(1);
  });

  it('removing after a PUT keeps a newer text that replaced the row meanwhile', async () => {
    await upsertTranslation(db, 'm1', 1, 'old', 'en-US');
    await upsertTranslation(db, 'm1', 1, 'newer', 'en-US'); // replaced while the PUT of "old" was in flight
    await removeTranslation(db, 'm1', 1, 'old');
    expect((await listUnsyncedTranslations(db, 'm1')).map((t) => t.text)).toEqual(['newer']);
    await removeTranslation(db, 'm1', 1, 'newer');
    expect(await countUnsyncedTranslations(db, 'm1')).toBe(0);
  });
});

describe('queue schema migration for pending_translations', () => {
  it('a database from before Phase 21 gains the table without losing its meetings', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'meetio-migrate-tr-'));
    const path = join(dir, 'legacy.db');
    try {
      const legacy = new DatabaseSync(path);
      legacy.exec(`CREATE TABLE local_meetings (
        id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL,
        create_body TEXT NOT NULL, server_created INTEGER NOT NULL DEFAULT 0, last_seq INTEGER NOT NULL DEFAULT 0,
        paused_ms INTEGER NOT NULL DEFAULT 0, paused_at INTEGER, blocked TEXT, recognition_mode TEXT);
        INSERT INTO local_meetings (id, owner_id, status, started_at, create_body) VALUES ('old', 'u1', 'recording', 1, '${JSON.stringify(BODY)}');`);
      legacy.close();

      const db = openNodeSqliteDb(path); // applies QUEUE_SCHEMA, as openQueueDb does
      await migrateQueueSchema(db);
      await upsertTranslation(db, 'old', 1, 'one', 'en-US');
      expect(await countUnsyncedTranslations(db, 'old')).toBe(1);
      expect((await db.getFirstAsync<{ id: string }>('SELECT id FROM local_meetings'))?.id).toBe('old');
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
