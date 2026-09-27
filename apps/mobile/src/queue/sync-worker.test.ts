import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TranscriptSegmentPayload } from '@meetio/shared';
import { openNodeSqliteDb } from './test-support/node-sqlite-db';
import { FakeSyncServer, axiosFailure } from './test-support/fake-sync-server';
import { getLocalMeeting, insertLocalMeeting, listLocalMeetings } from './local-meetings';
import { recordOp } from './lifecycle-ops';
import { countPending, enqueueSegment } from './segment-queue';
import { BULK_THRESHOLD, createSyncWorker, type SyncStatus } from './sync-worker';
import type { RealtimeHandlers, RealtimePort } from './meeting-socket';
import type { SqlDb } from './queue-db';

const BODY = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'high' } as const;
const seg = (i: number) => ({ text: `câu ${i}`, started_at_ms: i * 1000, ended_at_ms: i * 1000 + 900 });

function harness(db: SqlDb, server: FakeSyncServer, opts: { realtime?: boolean } = {}) {
  const timers: { fn: () => void; ms: number }[] = [];
  const statuses: SyncStatus[] = [];
  const synced: string[] = [];
  const blocked: string[] = [];
  let handlers!: RealtimeHandlers;
  const sent: TranscriptSegmentPayload[] = [];
  let ready = false;
  const realtime: RealtimePort = {
    isReady: () => ready,
    open: () => undefined,
    send: (_id, s) => void sent.push(s),
    close: () => undefined,
  };
  const worker = createSyncWorker({
    db,
    api: server,
    now: () => 1_000_000,
    schedule: (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);
      return () => void timers.splice(timers.indexOf(t), 1);
    },
    makeRealtime: opts.realtime
      ? (h) => {
          handlers = h;
          return realtime;
        }
      : undefined,
    onStatus: (s) => void statuses.push(s),
    onMeetingSynced: (id) => void synced.push(id),
    onMeetingBlocked: (id) => void blocked.push(id),
  });
  let signedIn = false;
  // The first kick is signing in (setOwner kicks a pass itself); later ones are plain kicks.
  const start = () => {
    if (signedIn) return worker.kick();
    signedIn = true;
    worker.setOwner('u1');
  };
  const run = async () => {
    start();
    await worker.idle();
  };
  const fireTimers = async () => {
    for (const t of timers.splice(0)) t.fn();
    await worker.idle();
  };
  return { worker, start, run, fireTimers, timers, statuses, synced, blocked, sent, setReady: (v: boolean) => (ready = v), handlers: () => handlers };
}

describe('sync worker', () => {
  let db: ReturnType<typeof openNodeSqliteDb>;
  let server: FakeSyncServer;
  beforeEach(() => {
    db = openNodeSqliteDb();
    server = new FakeSyncServer();
  });
  afterEach(() => db.close());

  it('syncs a meeting started offline: create with its own id and start time, segments, then end with last_seq', async () => {
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: Date.UTC(2026, 8, 27, 7), createBody: BODY });
    for (let i = 1; i <= 3; i++) await enqueueSegment(db, 'm1', seg(i));
    await recordOp(db, 'm1', 'end', Date.UTC(2026, 8, 27, 8));
    const h = harness(db, server);

    await h.run();

    const m = server.meetings.get('m1')!;
    expect(m.userBody).toMatchObject({ ...BODY, id: 'm1', started_at: '2026-09-27T07:00:00.000Z' });
    expect([...m.segments.keys()]).toEqual([1, 2, 3]);
    expect(m.transitions).toEqual([{ op: 'end', at: '2026-09-27T08:00:00.000Z', last_seq: 3 }]);
    expect(await listLocalMeetings(db, 'u1')).toEqual([]);
    expect(h.synced).toEqual(['m1']);
    expect(h.statuses.at(-1)).toEqual({ pending: 0, online: true });
  });

  it('keeps everything while offline, reports it, and catches up in order once the network is back', async () => {
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 0, createBody: BODY });
    for (let i = 1; i <= 120; i++) await enqueueSegment(db, 'm1', seg(i));
    server.offline = true;
    const h = harness(db, server);

    await h.run();
    expect(h.statuses.at(-1)).toEqual({ pending: 120, online: false });
    expect(h.timers).toHaveLength(1); // a retry is scheduled, not a busy loop
    expect(server.meetings.size).toBe(0);

    server.offline = false;
    await h.fireTimers();
    expect([...server.meetings.get('m1')!.segments.keys()]).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
    expect(h.statuses.at(-1)).toEqual({ pending: 0, online: true });
  });

  it('replays pause and resume in order with the instant the user pressed them', async () => {
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 0, createBody: BODY });
    await recordOp(db, 'm1', 'pause', Date.UTC(2026, 0, 1, 0, 10));
    await recordOp(db, 'm1', 'resume', Date.UTC(2026, 0, 1, 0, 40));
    await harness(db, server).run();
    expect(server.meetings.get('m1')!.transitions).toEqual([
      { op: 'pause', at: '2026-01-01T00:10:00.000Z' },
      { op: 'resume', at: '2026-01-01T00:40:00.000Z' },
    ]);
  });

  it('treats a transition the server already applied (replay after a crash) as done', async () => {
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 0, createBody: BODY });
    await recordOp(db, 'm1', 'pause', 5);
    await recordOp(db, 'm1', 'resume', 9);
    // The pause reached the server, then the app died before the op left the local queue.
    await server.createMeeting('u1', { ...BODY, id: 'm1', started_at: new Date(0).toISOString() });
    server.meetings.get('m1')!.status = 'paused';
    await harness(db, server).run();
    expect(server.meetings.get('m1')!.transitions.map((t) => t.op)).toEqual(['resume']);
  });

  it('drops the local copy of a meeting deleted on the server', async () => {
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 0, createBody: BODY });
    await enqueueSegment(db, 'm1', seg(1));
    server.failNext.createMeeting = axiosFailure(404, 'MEETING_NOT_FOUND');
    const h = harness(db, server);
    await h.run();
    expect(await listLocalMeetings(db, 'u1')).toEqual([]);
    expect(await countPending(db)).toBe(0);
  });

  it('stops retrying a meeting the server refuses for consent, without holding up the others', async () => {
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 0, createBody: BODY });
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm2', startedAt: 1, createBody: BODY });
    await enqueueSegment(db, 'm1', seg(1));
    await enqueueSegment(db, 'm2', seg(1));
    server.failNext.createMeeting = axiosFailure(403, 'CONSENT_REQUIRED');
    const h = harness(db, server);

    await h.run();
    await h.run();

    expect(h.blocked).toEqual(['m1']);
    expect((await getLocalMeeting(db, 'm1'))?.blocked).toBe('CONSENT_REQUIRED');
    expect(await countPending(db, 'm1')).toBe(1); // kept — nothing is thrown away
    expect(server.calls.filter((c) => c === 'createMeeting')).toHaveLength(2); // m1 once, m2 once
    expect(server.meetings.get('m2')!.segments.size).toBe(1);
  });

  it("never uploads another user's meeting from a shared phone, and syncs nothing while signed out", async () => {
    await insertLocalMeeting(db, { ownerId: 'someone-else', id: 'theirs', startedAt: 0, createBody: BODY });
    await enqueueSegment(db, 'theirs', seg(1));
    const h = harness(db, server);
    await h.run();
    expect(server.calls).toEqual([]);
    expect(h.statuses.at(-1)).toEqual({ pending: 0, online: true });

    h.worker.setOwner(null);
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'mine', startedAt: 0, createBody: BODY });
    h.worker.kick();
    await h.worker.idle();
    expect(server.calls).toEqual([]);
  });

  it("an account switch while a sync call is in flight never uploads the previous user's meeting into the new account", async () => {
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'a-meeting', startedAt: 0, createBody: BODY });
    await enqueueSegment(db, 'a-meeting', seg(1));
    await recordOp(db, 'a-meeting', 'end', 5);
    const h = harness(db, server);
    let release!: () => void;
    const inFlight = new Promise<void>((r) => (release = r));
    let first = true;
    server.before = async () => {
      if (!first) return;
      first = false;
      await inFlight; // createMeeting for u1 is waiting to be sent…
    };
    h.start();
    await new Promise((r) => setTimeout(r, 0));
    // …when u1 signs out and u2 signs in on the same phone.
    server.signedIn = 'u2';
    h.worker.setOwner('u2');
    release();
    await h.worker.idle();

    expect(server.meetings.has('a-meeting')).toBe(false); // refused on the device, not created under u2
    expect([...server.ownerOf.values()]).not.toContain('u2');
    expect(await countPending(db, 'a-meeting')).toBe(1); // still kept for u1
    expect(await listLocalMeetings(db, 'u1')).toHaveLength(1);
  });

  it('retries a server error with backoff instead of dropping anything', async () => {
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 0, createBody: BODY });
    await enqueueSegment(db, 'm1', seg(1));
    server.failNext.bulkUpsertSegments = axiosFailure(500, 'INTERNAL_ERROR');
    const h = harness(db, server);
    await h.run();
    expect(await countPending(db)).toBe(1);
    expect(h.timers[0].ms).toBe(2_000);
    await h.fireTimers();
    expect(await countPending(db)).toBe(0);
  });

  describe('live meeting over the socket', () => {
    it('sends a small backlog over the socket and deletes each segment only on its ack; end waits for the acks', async () => {
      await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 0, createBody: BODY });
      for (let i = 1; i <= 3; i++) await enqueueSegment(db, 'm1', seg(i));
      await recordOp(db, 'm1', 'end', 50);
      const h = harness(db, server, { realtime: true });
      h.setReady(true);
      h.worker.setLive('m1');

      await h.run();
      expect(h.sent.map((s) => s.seq)).toEqual([1, 2, 3]);
      expect(server.calls).not.toContain('bulkUpsertSegments');
      expect(await countPending(db)).toBe(3);
      expect(server.meetings.get('m1')!.status).toBe('recording'); // end has not gone out yet

      for (const s of h.sent) {
        server.receiveSocketSegment('m1', s);
        h.handlers().onAck('m1', s.seq);
      }
      await new Promise((r) => setTimeout(r, 0));
      await h.worker.idle();
      expect(await countPending(db)).toBe(0);
      expect(server.meetings.get('m1')!.transitions).toEqual([{ op: 'end', at: expect.any(String), last_seq: 3 }]);
    });

    it('switches to bulk for a backlog above the threshold even with the socket up', async () => {
      await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 0, createBody: BODY });
      for (let i = 1; i <= BULK_THRESHOLD + 1; i++) await enqueueSegment(db, 'm1', seg(i));
      const h = harness(db, server, { realtime: true });
      h.setReady(true);
      h.worker.setLive('m1');
      await h.run();
      expect(h.sent).toEqual([]);
      expect(server.meetings.get('m1')!.segments.size).toBe(BULK_THRESHOLD + 1);
    });

    it('falls back to bulk after RATE_LIMITED instead of hammering the socket', async () => {
      await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 0, createBody: BODY });
      await enqueueSegment(db, 'm1', seg(1));
      const h = harness(db, server, { realtime: true });
      h.setReady(true);
      h.worker.setLive('m1');
      await h.run();
      expect(h.sent).toHaveLength(1);

      h.handlers().onSegmentError('m1', 1, 'RATE_LIMITED');
      await h.fireTimers();
      expect(h.sent).toHaveLength(1);
      expect(server.calls).toContain('bulkUpsertSegments');
      expect(await countPending(db)).toBe(0);
    });
  });

  it('chaos: killed at 30 random points mid-meeting, the server ends with every seq exactly once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'meetio-chaos-'));
    const path = join(dir, 'q.db');
    let rng = 42;
    const random = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    try {
      let live = openNodeSqliteDb(path);
      await insertLocalMeeting(live, { ownerId: 'u1', id: 'mx', startedAt: 0, createBody: BODY });
      let total = 0;
      for (let kill = 0; kill < 30; kill++) {
        const h = harness(live, server);
        server.offline = random() < 0.3;
        const burst = 1 + Math.floor(random() * 40);
        for (let i = 0; i < burst; i++) await enqueueSegment(live, 'mx', seg(++total));
        h.start(); // killed before, during, or after the pass finishes
        if (random() < 0.5) await h.worker.idle();
        h.worker.stop();
        await h.worker.idle();
        live.close();
        live = openNodeSqliteDb(path);
      }
      server.offline = false;
      await recordOp(live, 'mx', 'end', 1);
      await harness(live, server).run();
      live.close();

      const m = server.meetings.get('mx')!;
      expect([...m.segments.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
      expect(m.transitions).toEqual([{ op: 'end', at: expect.any(String), last_seq: total }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
