import { openNodeSqliteDb } from './test-support/node-sqlite-db';
import { FakeSyncServer, axiosFailure } from './test-support/fake-sync-server';
import { insertLocalMeeting, listLocalMeetings } from './local-meetings';
import { recordOp } from './lifecycle-ops';
import { enqueueSegment } from './segment-queue';
import { countUnsyncedTranslations, listUnsyncedTranslations, upsertTranslation } from './translation-queue';
import { createSyncWorker, type SyncStatus } from './sync-worker';
import { TRANSLATION_MAX_NOT_FOUND } from './sync-types';
import type { SqlDb } from './queue-db';

const BODY = { source_language: 'vi-VN', translate_to: 'en-US', audio_source: 'device_mic', recording_quality: 'high' } as const;
const seg = (i: number) => ({ text: `câu ${i}`, started_at_ms: i * 1000, ended_at_ms: i * 1000 + 900 });

function harness(db: SqlDb, server: FakeSyncServer) {
  const timers: { fn: () => void; ms: number }[] = [];
  const statuses: SyncStatus[] = [];
  const worker = createSyncWorker({
    db,
    api: server,
    now: () => 1_000_000,
    schedule: (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);
      return () => void timers.splice(timers.indexOf(t), 1);
    },
    onStatus: (s) => void statuses.push(s),
  });
  return {
    statuses,
    timers,
    run: async () => {
      worker.setOwner('u1');
      await worker.idle();
    },
    kick: async () => {
      worker.kick();
      await worker.idle();
    },
    fireTimers: async () => {
      for (const t of timers.splice(0)) t.fn();
      await worker.idle();
    },
  };
}

describe('sync worker: on-device translations (Phase 21)', () => {
  let db: ReturnType<typeof openNodeSqliteDb>;
  let server: FakeSyncServer;
  beforeEach(async () => {
    db = openNodeSqliteDb();
    server = new FakeSyncServer();
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 0, createBody: BODY });
    for (let i = 1; i <= 2; i++) await enqueueSegment(db, 'm1', seg(i));
  });
  afterEach(() => db.close());

  it('puts every translation after its segment is on the server and BEFORE sending end', async () => {
    await upsertTranslation(db, 'm1', 1, 'sentence 1', 'en-US');
    await upsertTranslation(db, 'm1', 2, 'sentence 2', 'en-US');
    await recordOp(db, 'm1', 'end', 50);
    await harness(db, server).run();

    expect(server.calls.filter((c) => c !== 'createMeeting')).toEqual(['bulkUpsertSegments', 'putSegmentTranslation', 'putSegmentTranslation', 'transitionMeeting']);
    expect(await listLocalMeetings(db, 'u1')).toEqual([]);
    // The local copy is deleted with the meeting after end; the server kept what was put.
    expect([...server.meetings.get('m1')!.translations.values()].map((t) => t.translated_text)).toEqual(['sentence 1', 'sentence 2']);
  });

  it('holds end back while a translation cannot be delivered, then sends it once it can (404 -> backoff retry)', async () => {
    await upsertTranslation(db, 'm1', 1, 'sentence 1', 'en-US');
    await recordOp(db, 'm1', 'end', 50);
    server.failNext.putSegmentTranslation = axiosFailure(404, 'SEGMENT_NOT_FOUND');
    const h = harness(db, server);
    await h.run();

    expect(server.calls).not.toContain('transitionMeeting');
    expect(await countUnsyncedTranslations(db, 'm1')).toBe(1);
    expect((await listUnsyncedTranslations(db, 'm1'))[0].attempts).toBe(1);
    expect(h.timers).toHaveLength(1); // a retry with backoff, not a busy loop

    await h.fireTimers();
    expect(server.meetings.get('m1')!.translations.get(1)?.translated_text).toBe('sentence 1');
    expect(server.calls).toContain('transitionMeeting');
  });

  it('gives up on a translation the server keeps answering 404 for, so end is never stranded', async () => {
    await upsertTranslation(db, 'm1', 1, 'sentence 1', 'en-US');
    await recordOp(db, 'm1', 'end', 50);
    server.putSegmentTranslation = async () => {
      throw axiosFailure(404, 'SEGMENT_NOT_FOUND');
    };
    const h = harness(db, server);
    await h.run();
    for (let i = 0; i < TRANSLATION_MAX_NOT_FOUND + 2; i++) await h.fireTimers();
    expect(server.calls).toContain('transitionMeeting');
    expect(await countUnsyncedTranslations(db, 'm1')).toBe(0);
  });

  it('drops a translation the server refuses with 400, keeps the rest, and still ends', async () => {
    await upsertTranslation(db, 'm1', 1, 'wrong language', 'vi-VN');
    await upsertTranslation(db, 'm1', 2, 'sentence 2', 'en-US');
    await recordOp(db, 'm1', 'end', 50);
    const h = harness(db, server);
    await h.run();

    expect([...server.meetings.get('m1')!.translations.keys()]).toEqual([2]);
    expect(server.calls.filter((c) => c === 'putSegmentTranslation')).toHaveLength(2); // 400 is not retried
    expect(server.calls).toContain('transitionMeeting');
    expect(h.timers).toHaveLength(0);
  });

  it('keeps an offline translation for the next pass and counts it as pending', async () => {
    await upsertTranslation(db, 'm1', 1, 'sentence 1', 'en-US');
    server.failNext.putSegmentTranslation = axiosFailure();
    const h = harness(db, server);
    await h.run();
    expect(await countUnsyncedTranslations(db, 'm1')).toBe(1);
    expect(h.statuses.at(-1)).toEqual({ pending: 1, online: false });
    await h.fireTimers();
    expect(await countUnsyncedTranslations(db, 'm1')).toBe(0);
    expect(h.statuses.at(-1)).toEqual({ pending: 0, online: true });
  });

  it("syncs a translation only for the signed-in owner's meeting (guarded call)", async () => {
    await upsertTranslation(db, 'm1', 1, 'sentence 1', 'en-US');
    server.signedIn = 'u2';
    await harness(db, server).run();
    expect(server.meetings.get('m1')?.translations.size ?? 0).toBe(0);
    expect(await countUnsyncedTranslations(db, 'm1')).toBe(1);
  });

  it('does not send end when a translation lands on disk during the pass; the next pass sends it, then end', async () => {
    await recordOp(db, 'm1', 'end', 50);
    // The end op is read a second time right after the translations were synced: a translation finishing at that
    // very moment (the phone is still translating the last line) must hold `end` back.
    let injected = false;
    let opReads = 0;
    const racing: SqlDb = {
      ...db,
      getFirstAsync: (async (sql: string, params?: (string | number | null)[]) => {
        if (!injected && sql.includes('FROM pending_ops') && ++opReads === 2) {
          injected = true;
          await upsertTranslation(db, 'm1', 2, 'late sentence', 'en-US');
        }
        return db.getFirstAsync(sql, params);
      }) as SqlDb['getFirstAsync'],
    };
    const h = harness(racing, server);
    await h.run();
    expect(server.calls).not.toContain('transitionMeeting');

    await h.kick(); // what the session does after saving a translation
    expect(server.meetings.get('m1')!.translations.get(2)?.translated_text).toBe('late sentence');
    expect(server.calls.at(-1)).toBe('transitionMeeting');
  });
});
