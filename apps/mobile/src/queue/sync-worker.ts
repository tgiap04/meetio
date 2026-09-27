import { ApiErrorCode, type EndMeetingRequest } from '@meetio/shared';
import { BULK_LIMIT, BULK_THRESHOLD, INFLIGHT_WINDOW, RESEND_AFTER_MS, type SyncApi, type SyncStatus } from './sync-types';

export { BULK_LIMIT, BULK_THRESHOLD, INFLIGHT_WINDOW, RESEND_AFTER_MS, type SyncApi, type SyncStatus } from './sync-types';

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;
const RATE_LIMIT_BULK_MS = 60_000;
import type { SqlDb } from './queue-db';
import { deleteLocalMeeting, listLocalMeetings, markBlocked, markServerCreated, type LocalMeeting } from './local-meetings';
import { nextOp, removeOp, type PendingOp } from './lifecycle-ops';
import { ackSegments, countPending, countPendingForOwner, pendingSegments } from './segment-queue';
import { apiErrorCode, classifySyncError } from './sync-errors';
import type { RealtimeHandlers, RealtimePort } from './meeting-socket';

export interface SyncWorkerDeps {
  db: SqlDb;
  api: SyncApi;
  schedule: (fn: () => void, ms: number) => () => void;
  now: () => number;
  makeRealtime?: (handlers: RealtimeHandlers) => RealtimePort;
  onStatus?: (status: SyncStatus) => void;
  /** `end` accepted by the server; the local copy is gone. */
  onMeetingSynced?: (meetingId: string) => void;
  onMeetingBlocked?: (meetingId: string, code: string) => void;
}

/**
 * Drains the on-disk queue to the server, oldest meeting first: create (idempotent on the client
 * id) → replay pause/resume in order → segments → `end` once nothing is pending. Segments leave
 * the disk only on the server's ack. Every failure keeps the data and retries with backoff.
 */
export function createSyncWorker(deps: SyncWorkerDeps) {
  const { db, api } = deps;
  const inFlight = new Map<number, number>();
  let liveId: string | null = null;
  let running: Promise<void> | null = null;
  let again = false;
  let backoff = RETRY_MIN_MS;
  let cancelTimer: (() => void) | null = null;
  let bulkUntil = 0;
  let online = true;
  let ownerId: string | null = null;

  const realtime = deps.makeRealtime?.({
    onReady: () => kick(),
    onAck: (meetingId, seq) => {
      inFlight.delete(seq);
      void ackSegments(db, meetingId, [seq]).then(kick, kick);
    },
    onSegmentError: (_meetingId, seq, code) => {
      inFlight.delete(seq);
      if (code === ApiErrorCode.RATE_LIMITED) bulkUntil = deps.now() + RATE_LIMIT_BULK_MS;
      later(RETRY_MIN_MS);
    },
    onDown: () => {
      inFlight.clear();
      kick();
    },
  });

  function later(ms: number) {
    cancelTimer?.();
    cancelTimer = deps.schedule(() => {
      cancelTimer = null;
      kick();
    }, ms);
  }

  async function replay(op: PendingOp, owner: string) {
    try {
      const body: EndMeetingRequest = { at: new Date(op.at).toISOString() };
      await api.transitionMeeting(op.meetingId, op.op, op.op === 'end' && op.lastSeq ? { ...body, last_seq: op.lastSeq } : body, owner);
    } catch (error) {
      const code = apiErrorCode(error);
      // Already in that state (a replay after a crash), or closed server-side (24h auto-close) —
      // either way this transition has nothing left to do.
      if (code === ApiErrorCode.INVALID_STATE_TRANSITION) return;
      // Only possible if the server lost acked rows; waiting forever would strand the meeting.
      if (code === ApiErrorCode.SEGMENTS_PENDING) return void (await api.transitionMeeting(op.meetingId, 'end', { at: new Date(op.at).toISOString() }, owner));
      throw error;
    }
  }

  async function sendSegments(meetingId: string, owner: string) {
    const pending = await countPending(db, meetingId);
    if (pending === 0) return;
    const viaSocket = realtime && meetingId === liveId && realtime.isReady(meetingId) && pending <= BULK_THRESHOLD && deps.now() >= bulkUntil;
    if (!viaSocket) {
      inFlight.clear();
      for (;;) {
        const batch = await pendingSegments(db, meetingId, BULK_LIMIT);
        if (batch.length === 0) return;
        const acked = await api.bulkUpsertSegments(owner, meetingId, batch);
        await ackSegments(db, meetingId, acked);
        if (acked.length < batch.length) throw new Error('bulk left segments unacknowledged');
      }
    }
    const now = deps.now();
    for (const [seq, sentAt] of inFlight) if (now - sentAt > RESEND_AFTER_MS) inFlight.delete(seq);
    for (const segment of await pendingSegments(db, meetingId, INFLIGHT_WINDOW + inFlight.size)) {
      if (inFlight.size >= INFLIGHT_WINDOW) break;
      if (inFlight.has(segment.seq)) continue;
      inFlight.set(segment.seq, now);
      realtime.send(meetingId, segment);
    }
    if (inFlight.size > 0) later(RESEND_AFTER_MS);
  }

  async function syncMeeting(m: LocalMeeting) {
    if (!m.serverCreated) {
      await api.createMeeting(m.ownerId, { ...m.createBody, id: m.id, started_at: new Date(m.startedAt).toISOString() });
      await markServerCreated(db, m.id);
    }
    for (let op = await nextOp(db, m.id); op && op.op !== 'end'; op = await nextOp(db, m.id)) {
      await replay(op, m.ownerId);
      await removeOp(db, op.id);
    }
    if (m.id === liveId) realtime?.open(m.id);
    await sendSegments(m.id, m.ownerId);
    const head = await nextOp(db, m.id);
    if (head?.op === 'end' && (await countPending(db, m.id)) === 0) {
      await replay(head, m.ownerId);
      await deleteLocalMeeting(db, m.id);
      if (m.id === liveId) setLive(null);
      deps.onMeetingSynced?.(m.id);
    }
  }

  async function pass() {
    if (!ownerId) return;
    let offline = false;
    let retry = false;
    for (const m of await listLocalMeetings(db, ownerId)) {
      // Signed out / someone else signed in mid-pass: stop; setOwner kicks a fresh pass for them.
      if (m.ownerId !== ownerId) return;
      if (m.blocked) continue;
      try {
        await syncMeeting(m);
      } catch (error) {
        const failure = classifySyncError(error);
        if (failure.kind === 'stale') return; // the signed-in user changed under this pass
        if (failure.kind === 'offline') {
          offline = true;
          break;
        }
        if (failure.kind === 'gone') {
          await deleteLocalMeeting(db, m.id);
          deps.onMeetingSynced?.(m.id);
        } else if (failure.kind === 'blocked') {
          await markBlocked(db, m.id, failure.code);
          deps.onMeetingBlocked?.(m.id, failure.code);
        } else retry = true;
      }
    }
    online = !offline;
    if (offline || retry) {
      later(backoff);
      backoff = Math.min(RETRY_MAX_MS, backoff * 2);
    } else backoff = RETRY_MIN_MS;
    deps.onStatus?.({ pending: await countPendingForOwner(db, ownerId), online });
  }

  function kick() {
    if (running) {
      again = true;
      return;
    }
    running = (async () => {
      do {
        again = false;
        try {
          await pass();
        } catch {
          later(backoff); // the local DB itself failed — nothing to do but try again
        }
      } while (again);
    })().finally(() => {
      running = null;
    });
  }

  function setLive(meetingId: string | null) {
    liveId = meetingId;
    inFlight.clear();
    if (!meetingId) realtime?.close();
  }

  return {
    kick,
    setLive,
    /** The signed-in user; only their meetings sync. `null` (signed out) pauses syncing entirely. */
    setOwner(id: string | null) {
      ownerId = id;
      if (!id) setLive(null);
      else kick();
    },
    /** Resolves once the current pass (and any pass it queued) has finished — for tests and `end`. */
    idle: async () => {
      while (running) await running;
    },
    stop() {
      cancelTimer?.();
      cancelTimer = null;
      setLive(null);
    },
  };
}

export type SyncWorker = ReturnType<typeof createSyncWorker>;
