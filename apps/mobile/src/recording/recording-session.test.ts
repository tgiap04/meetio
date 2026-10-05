import type { TranscriptSegmentItem } from '@meetio/shared';
import { openNodeSqliteDb } from '../queue/test-support/node-sqlite-db';
import { getLocalMeeting, insertLocalMeeting } from '../queue/local-meetings';
import { nextOp, removeOp } from '../queue/lifecycle-ops';
import { enqueueSegment, pendingSegments } from '../queue/segment-queue';
import { createRecordingSession, type RecordingSessionDeps } from './recording-session';
import { resetRecordingStore, useRecordingStore } from './recording.store';
import type { RecognitionMode, SttEngine, SttHandlers, SttStartOptions } from './stt-engine';

const T0 = Date.UTC(2026, 8, 27, 7, 0, 0);

function fakeEngine() {
  let handlers: SttHandlers | null = null;
  const starts: SttStartOptions[] = [];
  let stops = 0;
  const engine: SttEngine = {
    start: (o) => void starts.push(o),
    stop: () => void (stops += 1),
    subscribe: (h) => {
      handlers = h;
      return () => {
        if (handlers === h) handlers = null;
      };
    },
  };
  return {
    engine,
    starts,
    stops: () => stops,
    subscribed: () => handlers !== null,
    emit: () => {
      if (!handlers) throw new Error('engine not subscribed');
      return handlers;
    },
  };
}

function setup(serverSegments: TranscriptSegmentItem[] = [], failWrites = 0, resumeMode: RecognitionMode = 'on_device') {
  const real = openNodeSqliteDb();
  let failuresLeft = failWrites;
  // Same database; the first `failWrites` transactions fail like a full or locked disk.
  const db: typeof real = {
    ...real,
    withExclusiveTransactionAsync: (task) =>
      failuresLeft-- > 0 ? Promise.reject(new Error('disk full')) : real.withExclusiveTransactionAsync(task),
  };
  const speech = fakeEngine();
  const server = fakeEngine();
  const modesAsked: RecognitionMode[] = [];
  let now = T0;
  const timers: { at: number; fn: () => void }[] = [];
  const kicks: number[] = [];
  const live: (string | null)[] = [];
  const keepalive = { starts: 0, stops: 0 };
  const deps: RecordingSessionDeps = {
    engineFor: (mode) => {
      modesAsked.push(mode);
      return mode === 'server' ? server.engine : speech.engine;
    },
    resolveMode: async () => resumeMode,
    db: async () => db,
    worker: { kick: () => void kicks.push(now), setLive: (id) => void live.push(id) },
    keepalive: { start: async () => void (keepalive.starts += 1), stop: async () => void (keepalive.stops += 1) },
    loadServerSegments: async () => serverSegments,
    now: () => now,
    schedule: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => void timers.splice(timers.indexOf(t), 1);
    },
    newId: () => 'meeting-1',
  };
  const session = createRecordingSession(deps);
  /** Moves the clock and fires every timer that came due. */
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers.filter((x) => x.at <= now)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { deps, db, speech, server, modesAsked, session, advance, settle, kicks, live, keepalive, setNow: (t: number) => (now = t) };
}

const SETTINGS = { ownerId: 'u1', language: 'vi-VN', audioSource: 'device_mic', quality: 'high', mode: 'on_device' } as const;

describe('recording session', () => {
  beforeEach(() => resetRecordingStore());

  it('start creates the meeting ON THE DEVICE first, then opens the mic with the chosen settings', async () => {
    const h = setup();
    const id = await h.session.start({ ...SETTINGS, audioSource: 'external_bluetooth', quality: 'standard' });

    expect(id).toBe('meeting-1');
    expect(await getLocalMeeting(h.db, id)).toMatchObject({
      ownerId: 'u1',
      status: 'recording',
      startedAt: T0,
      serverCreated: false,
      createBody: { source_language: 'vi-VN', translate_to: null, audio_source: 'external_bluetooth', recording_quality: 'standard' },
    });
    expect(h.speech.starts).toEqual([{ lang: 'vi-VN', interim: false, volume: false, bluetooth: true }]);
    expect(useRecordingStore.getState()).toMatchObject({ phase: 'recording', meetingId: id, startedAt: T0, quality: 'standard' });
    expect(h.live).toEqual([id]);
    expect(h.keepalive.starts).toBe(1);
  });

  it('start passes the chosen translation language into the create body (Phase 09), and defaults to none', async () => {
    const withTranslation = setup();
    const id = await withTranslation.session.start({ ...SETTINGS, translateTo: 'en-US' });
    expect((await getLocalMeeting(withTranslation.db, id))?.createBody).toMatchObject({ source_language: 'vi-VN', translate_to: 'en-US' });
    resetRecordingStore();
    const without = setup();
    await without.session.start(SETTINGS);
    expect((await getLocalMeeting(without.db, 'meeting-1'))?.createBody.translate_to).toBeNull();
  });

  it('refuses a second recording while one is live', async () => {
    const h = setup();
    await h.session.start(SETTINGS);
    await expect(h.session.start(SETTINGS)).rejects.toThrow('already in progress');
  });

  it('shows partials live, and writes each final to the queue with its seq before displaying it', async () => {
    const h = setup();
    await h.session.start(SETTINGS);
    h.speech.emit().onStart();
    h.advance(1_000);
    h.speech.emit().onResult('xin chào', false);
    expect(useRecordingStore.getState().partial).toBe('xin chào');
    h.advance(1_500);
    h.speech.emit().onResult('xin chào mọi người', true);
    await h.settle();

    expect(useRecordingStore.getState().partial).toBeNull();
    expect(useRecordingStore.getState().lines).toEqual([{ seq: 1, text: 'xin chào mọi người', startedAtMs: 1_000, endedAtMs: 2_500, gapBeforeMs: null }]);
    expect(await pendingSegments(h.db, 'meeting-1', 10)).toEqual([{ seq: 1, text: 'xin chào mọi người', started_at_ms: 1_000, ended_at_ms: 2_500 }]);
    expect(h.kicks.length).toBeGreaterThanOrEqual(2); // on start, and after the segment landed
  });

  it('restarts the engine by itself and marks the time it was deaf on the next segment', async () => {
    const h = setup();
    await h.session.start(SETTINGS);
    h.speech.emit().onStart();
    h.speech.emit().onEnd(); // engine gave up on its own
    h.advance(100);
    expect(h.speech.starts).toHaveLength(2);
    h.advance(3_900); // new session took 4s to come up
    h.speech.emit().onStart();
    h.speech.emit().onResult('tiếp tục', true);
    await h.settle();

    expect(useRecordingStore.getState().lines[0]).toMatchObject({ text: 'tiếp tục', gapBeforeMs: 4_000 });
  });

  it('keeps the words of an utterance the engine dropped mid-sentence', async () => {
    const h = setup();
    await h.session.start(SETTINGS);
    h.speech.emit().onStart();
    h.speech.emit().onResult('câu bị cắt ngang', false);
    h.speech.emit().onEnd();
    await h.settle();
    expect(useRecordingStore.getState().lines.map((l) => l.text)).toEqual(['câu bị cắt ngang']);
  });

  it('pause turns the mic off, saves the sentence in progress and excludes paused time; resume is not a gap', async () => {
    const h = setup();
    await h.session.start(SETTINGS);
    h.speech.emit().onStart();
    h.advance(10_000);
    h.speech.emit().onResult('trước giờ nghỉ', false);
    await h.session.pause();

    expect(h.speech.stops()).toBe(1);
    expect(useRecordingStore.getState()).toMatchObject({ phase: 'paused', pausedAt: T0 + 10_000, partial: null });
    expect(useRecordingStore.getState().lines.map((l) => l.text)).toEqual(['trước giờ nghỉ']);
    expect(await getLocalMeeting(h.db, 'meeting-1')).toMatchObject({ status: 'paused' });

    h.advance(300_000);
    await h.session.resume();
    expect(useRecordingStore.getState()).toMatchObject({ phase: 'recording', pausedAt: null, pausedMs: 300_000 });
    h.speech.emit().onStart();
    h.speech.emit().onResult('sau giờ nghỉ', true);
    await h.settle();
    expect(useRecordingStore.getState().lines[1]).toMatchObject({ text: 'sau giờ nghỉ', gapBeforeMs: null });

    const ops = [];
    for (let op = await nextOp(h.db, 'meeting-1'); op; op = await nextOp(h.db, 'meeting-1')) {
      ops.push([op.op, op.at]);
      await removeOp(h.db, op.id);
    }
    expect(ops).toEqual([
      ['pause', T0 + 10_000],
      ['resume', T0 + 310_000],
    ]);
  });

  it('end stops listening for good and queues `end` with the last seq; the sync worker does the rest', async () => {
    const h = setup();
    await h.session.start(SETTINGS);
    h.speech.emit().onStart();
    h.speech.emit().onResult('một', true);
    h.speech.emit().onResult('hai', false);
    await h.session.end();

    expect(useRecordingStore.getState().phase).toBe('ending');
    expect(h.speech.subscribed()).toBe(false);
    expect(h.keepalive.stops).toBe(1);
    const op = await nextOp(h.db, 'meeting-1');
    expect(op).toMatchObject({ op: 'end', lastSeq: 2 });

    h.session.finish('meeting-1');
    expect(useRecordingStore.getState()).toMatchObject({ phase: 'idle', meetingId: null, endedMeetingId: 'meeting-1' });
    expect(h.live.at(-1)).toBeNull();
  });

  it('tells the user what to do when the engine refuses, and clears it once recognition runs again', async () => {
    const h = setup();
    await h.session.start(SETTINGS);
    h.speech.emit().onError('language-not-supported', 'x');
    expect(useRecordingStore.getState().problem).toMatch(/gói nhận diện offline/);
    h.speech.emit().onStart();
    expect(useRecordingStore.getState().problem).toBeNull();
  });

  it('a segment the disk refused is kept and saved later, in order — never dropped', async () => {
    const h = setup([], 1);
    await h.session.start(SETTINGS);
    h.speech.emit().onStart();
    h.speech.emit().onResult('một', true);
    await h.settle();
    expect(useRecordingStore.getState().problem).toMatch(/Meetio sẽ thử lại/);
    expect(useRecordingStore.getState().lines).toEqual([]);

    h.speech.emit().onResult('hai', true);
    await h.settle();
    expect(useRecordingStore.getState().lines.map((l) => [l.seq, l.text])).toEqual([
      [1, 'một'],
      [2, 'hai'],
    ]);
    expect(useRecordingStore.getState().problem).toBeNull();
    expect((await pendingSegments(h.db, 'meeting-1', 10)).map((s) => s.text)).toEqual(['một', 'hai']);
  });

  it('ignores transient engine stops (no-speech) — no alarming message', async () => {
    const h = setup();
    await h.session.start(SETTINGS);
    h.speech.emit().onStart();
    h.speech.emit().onError('no-speech', 'x');
    expect(useRecordingStore.getState().problem).toBeNull();
  });

  describe('server mode (Phase 18)', () => {
    const SERVER = { ...SETTINGS, mode: 'server' } as const;

    it('records with the server engine, never the on-device one (interim is requested; only the streaming engine honours it)', async () => {
      const h = setup();
      await h.session.start(SERVER);
      expect(h.modesAsked).toEqual(['server']);
      expect(h.server.starts).toEqual([{ lang: 'vi-VN', interim: true, volume: true, bluetooth: false, upload: { ownerId: 'u1', meetingId: 'meeting-1' } }]);
      expect(h.speech.starts).toEqual([]);
    });

    it('uses the on-device engine for on-device mode', async () => {
      const h = setup();
      await h.session.start(SETTINGS);
      expect(h.modesAsked).toEqual(['on_device']);
      expect(h.speech.starts).toHaveLength(1);
      expect(h.server.starts).toEqual([]);
    });

    it('turns chunk transcripts into segments and lost chunks into a gap before the next one', async () => {
      const h = setup();
      await h.session.start(SERVER);
      h.server.emit().onStart();
      h.advance(12_000);
      h.server.emit().onResult('đoạn một', true);
      h.server.emit().onGap?.(10_000);
      h.advance(10_000);
      h.server.emit().onResult('đoạn ba', true);
      await h.settle();
      expect(useRecordingStore.getState().lines.map((l) => [l.text, l.gapBeforeMs])).toEqual([
        ['đoạn một', null],
        ['đoạn ba', 10_000],
      ]);
    });

    it('does not restart the engine while it simply keeps recording', async () => {
      const h = setup();
      await h.session.start(SERVER);
      h.server.emit().onStart();
      h.advance(60_000);
      expect(h.server.starts).toHaveLength(1);
    });

    it('pause waits for the last chunk transcript, which still becomes a segment, before the pause is recorded', async () => {
      const h = setup();
      await h.session.start(SERVER);
      h.server.emit().onStart();
      h.advance(4_000);
      const paused = h.session.pause();
      await h.settle();
      expect(h.server.stops()).toBe(1);
      expect(useRecordingStore.getState().phase).toBe('recording'); // still flushing the last chunk
      h.server.emit().onResult('câu cuối trước khi tạm dừng', true);
      h.server.emit().onEnd();
      await paused;
      expect(useRecordingStore.getState()).toMatchObject({ phase: 'paused' });
      expect(useRecordingStore.getState().lines.map((l) => l.text)).toEqual(['câu cuối trước khi tạm dừng']);
    });

    it('does not hang on pause when the engine never reports its end', async () => {
      const h = setup();
      await h.session.start(SERVER);
      h.server.emit().onStart();
      const paused = h.session.pause();
      await h.settle();
      h.advance(40_000);
      await paused;
      expect(useRecordingStore.getState().phase).toBe('paused');
    });

    it('pause does not wait for an engine that never started', async () => {
      const h = setup();
      await h.session.start(SERVER);
      await h.session.pause();
      expect(useRecordingStore.getState().phase).toBe('paused');
    });

    it('stores the mode with the local meeting so a resume can keep it', async () => {
      const h = setup();
      await h.session.start(SERVER);
      expect(await getLocalMeeting(h.db, 'meeting-1')).toMatchObject({ recognitionMode: 'server' });
    });

    const stored = (h: ReturnType<typeof setup>, recognitionMode: 'on_device' | 'server' | null) =>
      insertLocalMeeting(h.db, {
        ownerId: 'u1',
        id: 'meeting-1',
        startedAt: T0,
        createBody: { source_language: 'vi-VN', translate_to: null, audio_source: 'device_mic', recording_quality: 'high' },
        recognitionMode,
      });

    it('a meeting that started on-device resumes on-device even if the device now looks server-only (never a silent switch)', async () => {
      const h = setup([], 0, 'server');
      await stored(h, 'on_device');
      await h.session.resumeUnfinished('meeting-1');
      expect(h.modesAsked).toEqual(['on_device']);
      expect(h.server.starts).toEqual([]);
      expect(h.speech.starts).toHaveLength(1);
    });

    it('a meeting that started on the server resumes there', async () => {
      const h = setup([], 0, 'on_device');
      await stored(h, 'server');
      await h.session.resumeUnfinished('meeting-1');
      expect(h.modesAsked).toEqual(['server']);
      expect(h.server.starts[0]).toMatchObject({ upload: { ownerId: 'u1', meetingId: 'meeting-1' } });
    });

    it('does not guess when an adopted meeting has no stored mode and the device cannot tell', async () => {
      const real = setup();
      const h = { ...real };
      await stored(h, null);
      const failing = createRecordingSession({ ...real.deps, resolveMode: () => Promise.reject(new Error('cannot tell')) });
      await expect(failing.resumeUnfinished('meeting-1')).rejects.toThrow('cannot tell');
      expect(real.speech.starts).toEqual([]);
      expect(real.server.starts).toEqual([]);
    });

    it('a recovered meeting with no stored mode picks its engine from what the device can do now', async () => {
      const h = setup([], 0, 'server');
      await insertLocalMeeting(h.db, {
        ownerId: 'u1',
        id: 'meeting-1',
        startedAt: T0,
        createBody: { source_language: 'vi-VN', translate_to: null, audio_source: 'device_mic', recording_quality: 'high' },
        recognitionMode: null,
      });
      await h.session.resumeUnfinished('meeting-1');
      expect(h.modesAsked).toEqual(['server']);
      expect(h.server.starts).toHaveLength(1);
      expect(h.speech.starts).toEqual([]);
    });
  });

  describe('resuming a meeting the app died in (US-15)', () => {
    const serverSeg = (seq: number, text: string, start: number): TranscriptSegmentItem =>
      ({ id: `s${seq}`, seq, text, started_at_ms: start, ended_at_ms: start + 900, gap_before_ms: null, is_edited: false }) as TranscriptSegmentItem;

    it('shows server + local segments in seq order, continues the seqs, and marks the dead time', async () => {
      const h = setup([serverSeg(1, 'đã lên máy chủ', 1_000), serverSeg(2, 'cũng đã lên', 5_000)]);
      await insertLocalMeeting(h.db, {
        ownerId: 'u1',
        id: 'meeting-1',
        startedAt: T0,
        createBody: { source_language: 'vi-VN', translate_to: null, audio_source: 'device_mic', recording_quality: 'high' },
        serverCreated: true,
        lastSeq: 2,
      });
      await enqueueSegment(h.db, 'meeting-1', { text: 'chưa gửi kịp', started_at_ms: 9_000, ended_at_ms: 9_900 }); // seq 3
      h.setNow(T0 + 60_000);

      await h.session.resumeUnfinished('meeting-1');
      expect(useRecordingStore.getState().lines.map((l) => [l.seq, l.text])).toEqual([
        [1, 'đã lên máy chủ'],
        [2, 'cũng đã lên'],
        [3, 'chưa gửi kịp'],
      ]);
      expect(useRecordingStore.getState().phase).toBe('recording');
      h.speech.emit().onStart();
      h.speech.emit().onResult('ghi tiếp', true);
      await h.settle();

      const last = useRecordingStore.getState().lines.at(-1)!;
      expect(last).toMatchObject({ seq: 4, text: 'ghi tiếp', gapBeforeMs: 60_000 - 9_900 });
    });

    it('a meeting adopted from the server numbers new segments after the server’s highest seq', async () => {
      const h = setup([serverSeg(1, 'a', 0), serverSeg(2, 'b', 2_000)]);
      await insertLocalMeeting(h.db, {
        ownerId: 'u1',
        id: 'meeting-1',
        startedAt: T0,
        createBody: { source_language: 'vi-VN', translate_to: null, audio_source: 'device_mic', recording_quality: 'high' },
        serverCreated: true,
      });
      await h.session.resumeUnfinished('meeting-1');
      h.speech.emit().onStart();
      h.speech.emit().onResult('c', true);
      await h.settle();
      expect(useRecordingStore.getState().lines.map((l) => l.seq)).toEqual([1, 2, 3]);
      expect((await pendingSegments(h.db, 'meeting-1', 10)).map((s) => s.seq)).toEqual([3]);
    });

    it('shows the translations the server already stored for the lines it loads (Phase 09)', async () => {
      const translated = { ...serverSeg(1, 'xin chào', 1_000), translated_text: 'hello', translated_to: 'en-US' } as TranscriptSegmentItem;
      const h = setup([translated, { ...serverSeg(2, 'chưa dịch', 3_000), translated_text: null, translated_to: null } as TranscriptSegmentItem]);
      await insertLocalMeeting(h.db, {
        ownerId: 'u1',
        id: 'meeting-1',
        startedAt: T0,
        createBody: { source_language: 'vi-VN', translate_to: 'en-US', audio_source: 'device_mic', recording_quality: 'high' },
        serverCreated: true,
        lastSeq: 2,
      });
      await h.session.resumeUnfinished('meeting-1');
      expect(useRecordingStore.getState().translations).toEqual({ 1: { status: 'done', text: 'hello', to: 'en-US' } });
    });

    it('a meeting left paused resumes through a replayed `resume`', async () => {
      const h = setup();
      await insertLocalMeeting(h.db, {
        ownerId: 'u1',
        id: 'meeting-1',
        startedAt: T0,
        createBody: { source_language: 'en-US', translate_to: null, audio_source: 'device_mic', recording_quality: 'high' },
        status: 'paused',
        pausedAt: T0 + 1_000,
      });
      h.setNow(T0 + 11_000);
      await h.session.resumeUnfinished('meeting-1');

      expect(useRecordingStore.getState()).toMatchObject({ phase: 'recording', pausedMs: 10_000 });
      expect(h.speech.starts.at(-1)).toMatchObject({ lang: 'en-US' });
      expect(await nextOp(h.db, 'meeting-1')).toMatchObject({ op: 'resume', at: T0 + 11_000 });
    });

    it('a meeting already ended locally just keeps syncing — the mic stays off', async () => {
      const h = setup();
      await insertLocalMeeting(h.db, {
        ownerId: 'u1',
        id: 'meeting-1',
        startedAt: T0,
        createBody: { source_language: 'vi-VN', translate_to: null, audio_source: 'device_mic', recording_quality: 'high' },
        status: 'ending',
      });
      await h.session.resumeUnfinished('meeting-1');
      expect(useRecordingStore.getState().phase).toBe('ending');
      expect(h.speech.starts).toEqual([]);
    });
  });
});
