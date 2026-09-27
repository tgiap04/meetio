import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNodeSqliteDb } from './test-support/node-sqlite-db';
import { deleteLocalMeeting, getLocalMeeting, insertLocalMeeting, listLocalMeetings, raiseLastSeq } from './local-meetings';
import { nextOp, recordOp, removeOp } from './lifecycle-ops';
import { ackSegments, countPending, enqueueSegment, pendingSegments, pendingSegmentsBySeq } from './segment-queue';

const BODY = { source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'high' } as const;
const seg = (text: string, gap?: number) => ({ text, started_at_ms: 1000, ended_at_ms: 1900, ...(gap ? { gap_before_ms: gap } : {}) });

describe('on-disk transcript queue (real SQLite)', () => {
  let db: ReturnType<typeof openNodeSqliteDb>;
  beforeEach(async () => {
    db = openNodeSqliteDb();
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm1', startedAt: 1_000, createBody: BODY });
  });
  afterEach(() => db.close());

  it('assigns contiguous seqs from 1, even to segments enqueued concurrently', async () => {
    const seqs = await Promise.all(Array.from({ length: 25 }, (_, i) => enqueueSegment(db, 'm1', seg(`câu ${i}`))));
    expect([...seqs].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect((await getLocalMeeting(db, 'm1'))?.lastSeq).toBe(25);
    expect(await countPending(db, 'm1')).toBe(25);
  });

  it('returns pending segments oldest first, keeps gap_before_ms, and drops them only on ack', async () => {
    await enqueueSegment(db, 'm1', seg('một'));
    await enqueueSegment(db, 'm1', seg('hai', 12_000));
    await enqueueSegment(db, 'm1', seg('ba'));

    expect(await pendingSegments(db, 'm1', 10)).toEqual([
      { seq: 1, text: 'một', started_at_ms: 1000, ended_at_ms: 1900 },
      { seq: 2, text: 'hai', started_at_ms: 1000, ended_at_ms: 1900, gap_before_ms: 12_000 },
      { seq: 3, text: 'ba', started_at_ms: 1000, ended_at_ms: 1900 },
    ]);
    await ackSegments(db, 'm1', [1, 3]);
    expect((await pendingSegments(db, 'm1', 10)).map((s) => s.seq)).toEqual([2]);
    expect((await pendingSegmentsBySeq(db, 'm1', [1, 2])).map((s) => s.seq)).toEqual([2]);
  });

  it('refuses a segment for a meeting that does not exist, leaving nothing half-written', async () => {
    await expect(enqueueSegment(db, 'nope', seg('x'))).rejects.toThrow('unknown local meeting');
    expect(await countPending(db)).toBe(0);
  });

  it('continues numbering after the server’s highest seq on resume', async () => {
    await raiseLastSeq(db, 'm1', 40);
    await raiseLastSeq(db, 'm1', 7); // never lowers
    expect(await enqueueSegment(db, 'm1', seg('tiếp'))).toBe(41);
  });

  it('records pause/resume/end in order, flipping local status and excluding paused time', async () => {
    await enqueueSegment(db, 'm1', seg('a'));
    await recordOp(db, 'm1', 'pause', 10_000);
    expect((await getLocalMeeting(db, 'm1'))?.status).toBe('paused');
    await recordOp(db, 'm1', 'resume', 25_000);
    await enqueueSegment(db, 'm1', seg('b'));
    await recordOp(db, 'm1', 'end', 40_000);

    expect(await getLocalMeeting(db, 'm1')).toMatchObject({ status: 'ending', pausedMs: 15_000, pausedAt: null });
    const ops = [];
    for (let op = await nextOp(db, 'm1'); op; op = await nextOp(db, 'm1')) {
      ops.push({ op: op.op, at: op.at, lastSeq: op.lastSeq });
      await removeOp(db, op.id);
    }
    expect(ops).toEqual([
      { op: 'pause', at: 10_000, lastSeq: null },
      { op: 'resume', at: 25_000, lastSeq: null },
      { op: 'end', at: 40_000, lastSeq: 2 },
    ]);
  });

  it('deleting a meeting removes its segments and ops but not another meeting’s', async () => {
    await insertLocalMeeting(db, { ownerId: 'u1', id: 'm2', startedAt: 2_000, createBody: BODY });
    await enqueueSegment(db, 'm1', seg('a'));
    await enqueueSegment(db, 'm2', seg('b'));
    await recordOp(db, 'm1', 'end', 5_000);
    await deleteLocalMeeting(db, 'm1');

    expect((await listLocalMeetings(db, 'u1')).map((m) => m.id)).toEqual(['m2']);
    expect(await countPending(db)).toBe(1);
    expect(await nextOp(db, 'm1')).toBeNull();
  });

  it('survives the app being killed: a reopened database still holds the queue', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'meetio-queue-'));
    try {
      const path = join(dir, 'q.db');
      const first = openNodeSqliteDb(path);
      await insertLocalMeeting(first, { ownerId: 'u1', id: 'm9', startedAt: 9, createBody: BODY });
      await enqueueSegment(first, 'm9', seg('trước khi chết'));
      first.close();

      const reopened = openNodeSqliteDb(path);
      expect((await pendingSegments(reopened, 'm9', 10)).map((s) => s.text)).toEqual(['trước khi chết']);
      expect((await listLocalMeetings(reopened, 'u1'))[0]).toMatchObject({ id: 'm9', createBody: BODY, serverCreated: false });
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
