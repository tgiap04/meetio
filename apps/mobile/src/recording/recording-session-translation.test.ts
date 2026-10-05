import type { TranscriptSegmentItem } from '@meetio/shared';
import { openNodeSqliteDb } from '../queue/test-support/node-sqlite-db';
import { insertLocalMeeting } from '../queue/local-meetings';
import { enqueueSegment } from '../queue/segment-queue';
import { nextOp } from '../queue/lifecycle-ops';
import { listUnsyncedTranslations, upsertTranslation } from '../queue/translation-queue';
import { createRecordingSession, type RecordingSessionDeps } from './recording-session';
import { resetRecordingStore, useRecordingStore } from './recording.store';
import type { SttEngine, SttHandlers } from './stt-engine';

const T0 = Date.UTC(2026, 8, 27, 7, 0, 0);
const SETTINGS = { ownerId: 'u1', language: 'vi-VN', audioSource: 'device_mic', quality: 'standard', translateTo: 'en-US' } as const;

interface Deferred {
  text: string;
  resolve(v: string): void;
  reject(e: Error): void;
}

function setup(opts: { translate?: RecordingSessionDeps['translate'] } = {}) {
  const db = openNodeSqliteDb();
  let handlers: SttHandlers | null = null;
  const engine: SttEngine = {
    start: () => undefined,
    stop: () => undefined,
    subscribe: (h) => {
      handlers = h;
      return () => undefined;
    },
  };
  const calls: Deferred[] = [];
  // A translator the test settles by hand, so "still translating" can be observed.
  const manual: RecordingSessionDeps['translate'] = (text) => new Promise((resolve, reject) => calls.push({ text, resolve, reject }));
  const kicks: number[] = [];
  const deps: RecordingSessionDeps = {
    engineFor: () => engine,
    resolveMode: async () => 'on_device',
    db: async () => db,
    worker: { kick: () => void kicks.push(1), setLive: () => undefined },
    keepalive: { start: async () => undefined, stop: async () => undefined },
    loadServerSegments: async () => [],
    now: () => T0,
    schedule: () => () => undefined,
    newId: () => 'm1',
    translate: opts.translate ?? manual,
  };
  const session = createRecordingSession(deps);
  const say = (text: string, mode: 'on_device' | 'server' = 'on_device') => {
    if (mode === 'on_device') handlers!.onStart();
    handlers!.onResult(text, true);
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { db, session, calls, say, settle, kicks, engine };
}

describe('recording session translates every final line on the device (Phase 21)', () => {
  beforeEach(() => resetRecordingStore());

  it('on-device recognition: a final line is translated right away and shown by seq, then persisted for sync', async () => {
    const h = setup();
    await h.session.start({ ...SETTINGS, mode: 'on_device' });
    h.say('xin chào');
    await h.settle();
    expect(h.calls.map((c) => c.text)).toEqual(['xin chào']);
    expect(useRecordingStore.getState().translations[1]).toEqual({ status: 'pending' });

    h.calls[0].resolve('hello');
    await h.settle();
    expect(useRecordingStore.getState().translations[1]).toEqual({ status: 'done', text: 'hello', to: 'en-US' });
    expect(await listUnsyncedTranslations(h.db, 'm1')).toEqual([{ meetingId: 'm1', seq: 1, text: 'hello', translatedTo: 'en-US', attempts: 0 }]);
    expect(h.kicks.length).toBeGreaterThan(1); // the worker was nudged to sync it
  });

  it('server recognition: finals are translated the same way', async () => {
    const h = setup({ translate: async (text) => `en:${text}` });
    await h.session.start({ ...SETTINGS, mode: 'server' });
    h.say('một', 'server');
    h.say('hai', 'server');
    await h.settle();
    await h.settle();
    const { translations } = useRecordingStore.getState();
    expect(translations[1]).toEqual({ status: 'done', text: 'en:một', to: 'en-US' });
    expect(translations[2]).toEqual({ status: 'done', text: 'en:hai', to: 'en-US' });
  });

  it('translates in the language pair chosen at setup', async () => {
    const seen: string[] = [];
    const h = setup({ translate: async (text, from, to) => (seen.push(`${from}>${to}`), text) });
    await h.session.start({ ...SETTINGS, mode: 'on_device' });
    h.say('xin chào');
    await h.settle();
    expect(seen).toEqual(['vi-VN>en-US']);
  });

  it('does not translate when translation is off', async () => {
    const h = setup();
    await h.session.start({ ...SETTINGS, translateTo: null, mode: 'on_device' });
    h.say('xin chào');
    await h.settle();
    expect(h.calls).toEqual([]);
    expect(useRecordingStore.getState().translations).toEqual({});
  });

  it('a failed translation is marked failed, persists nothing, and can be retried on the device', async () => {
    const h = setup();
    await h.session.start({ ...SETTINGS, mode: 'on_device' });
    h.say('xin chào');
    await h.settle();
    h.calls[0].reject(new Error('Model not downloaded'));
    await h.settle();
    expect(useRecordingStore.getState().translations[1]).toEqual({ status: 'failed' });
    expect(await listUnsyncedTranslations(h.db, 'm1')).toEqual([]);

    const retry = h.session.retryTranslation(1);
    await h.settle();
    expect(useRecordingStore.getState().translations[1]).toEqual({ status: 'pending' });
    h.calls[1].resolve('hello');
    await retry;
    expect(useRecordingStore.getState().translations[1]).toMatchObject({ status: 'done', text: 'hello' });
    expect(await listUnsyncedTranslations(h.db, 'm1')).toHaveLength(1);
  });

  it('an empty translation counts as a failure rather than a blank card', async () => {
    const h = setup({ translate: async () => '   ' });
    await h.session.start({ ...SETTINGS, mode: 'on_device' });
    h.say('xin chào');
    await h.settle();
    expect(useRecordingStore.getState().translations[1]).toEqual({ status: 'failed' });
  });

  describe('ending', () => {
    it('waits for a translation still running — with no timeout — before the end op is recorded', async () => {
      const h = setup();
      await h.session.start({ ...SETTINGS, mode: 'on_device' });
      h.say('câu cuối');
      await h.settle();

      let ended = false;
      const ending = h.session.end().then(() => (ended = true));
      await new Promise((r) => setTimeout(r, 30));
      expect(ended).toBe(false);
      expect(useRecordingStore.getState().phase).toBe('ending'); // the screen shows "Đang dịch nốt câu cuối…"
      expect(await nextOp(h.db, 'm1')).toBeNull();

      h.calls[0].resolve('last sentence');
      await ending;
      expect((await nextOp(h.db, 'm1'))?.op).toBe('end');
      expect(await listUnsyncedTranslations(h.db, 'm1')).toHaveLength(1); // stored BEFORE end can be sent
    });

    it('does not wait for translations that already failed', async () => {
      const h = setup();
      await h.session.start({ ...SETTINGS, mode: 'on_device' });
      h.say('câu một');
      await h.settle();
      h.calls[0].reject(new Error('boom'));
      await h.settle();
      await h.session.end();
      expect((await nextOp(h.db, 'm1'))?.op).toBe('end');
    });

    it('a translation that fails while ending still lets it finish', async () => {
      const h = setup();
      await h.session.start({ ...SETTINGS, mode: 'on_device' });
      h.say('câu cuối');
      await h.settle();
      const ending = h.session.end();
      await h.settle();
      h.calls[0].reject(new Error('boom'));
      await ending;
      expect((await nextOp(h.db, 'm1'))?.op).toBe('end');
      expect(useRecordingStore.getState().translations[1]).toEqual({ status: 'failed' });
    });

    it('pausing never waits for translations', async () => {
      const h = setup();
      await h.session.start({ ...SETTINGS, mode: 'on_device' });
      h.say('câu một');
      await h.settle();
      await h.session.pause(); // resolves although the translation is still pending
      expect(useRecordingStore.getState().phase).toBe('paused');
    });

    it('puts the screen back to recording when the end op cannot be written', async () => {
      const h = setup({ translate: async (t) => t });
      await h.session.start({ ...SETTINGS, mode: 'on_device' });
      await h.db.execAsync('DROP TABLE pending_ops');
      await expect(h.session.end()).rejects.toThrow();
      expect(useRecordingStore.getState().phase).toBe('recording');
    });
  });

  describe('resuming an unfinished meeting', () => {
    const body = { source_language: 'vi-VN', translate_to: 'en-US', audio_source: 'device_mic', recording_quality: 'standard' } as const;

    it('shows translations still waiting to sync, and translates lines that never got one', async () => {
      const h = setup({ translate: async (t) => `en:${t}` });
      await insertLocalMeeting(h.db, { id: 'm1', ownerId: 'u1', startedAt: T0, createBody: body, recognitionMode: 'on_device', status: 'paused', pausedAt: T0 });
      await enqueueSegment(h.db, 'm1', { text: 'một', started_at_ms: 0, ended_at_ms: 9 });
      await enqueueSegment(h.db, 'm1', { text: 'hai', started_at_ms: 10, ended_at_ms: 19 });
      await upsertTranslation(h.db, 'm1', 1, 'one', 'en-US');

      await h.session.resumeUnfinished('m1');
      await h.settle();
      await h.settle();
      const { translations } = useRecordingStore.getState();
      expect(translations[1]).toEqual({ status: 'done', text: 'one', to: 'en-US' });
      expect(translations[2]).toEqual({ status: 'done', text: 'en:hai', to: 'en-US' });
    });

    it('an ending meeting is not re-translated on resume (no orphan translation rows)', async () => {
      const calls: string[] = [];
      const h = setup({ translate: async (t) => (calls.push(t), t) });
      await insertLocalMeeting(h.db, { id: 'm1', ownerId: 'u1', startedAt: T0, createBody: body, recognitionMode: 'on_device', status: 'ending' });
      await enqueueSegment(h.db, 'm1', { text: 'một', started_at_ms: 0, ended_at_ms: 9 });
      await h.session.resumeUnfinished('m1');
      await h.settle();
      expect(calls).toEqual([]);
      expect(await listUnsyncedTranslations(h.db, 'm1')).toEqual([]);
    });

    it('uses the server copy of a translation instead of translating again', async () => {
      const calls: string[] = [];
      const h = setup({ translate: async (t) => (calls.push(t), t) });
      const server: TranscriptSegmentItem[] = [
        { id: 's1', seq: 1, text: 'một', started_at_ms: 0, ended_at_ms: 9, gap_before_ms: null, edited: false, translated_text: 'one', translated_to: 'en-US' } as unknown as TranscriptSegmentItem,
      ];
      const withServer = createRecordingSession({ ...setupDeps(h), loadServerSegments: async () => server });
      await insertLocalMeeting(h.db, { id: 'm1', ownerId: 'u1', startedAt: T0, createBody: body, recognitionMode: 'on_device', status: 'ending', serverCreated: true, lastSeq: 1 });
      await withServer.resumeUnfinished('m1');
      expect(useRecordingStore.getState().translations[1]).toEqual({ status: 'done', text: 'one', to: 'en-US' });
      expect(calls).toEqual([]);
    });
  });
});

function setupDeps(h: ReturnType<typeof setup>): RecordingSessionDeps {
  return {
    engineFor: () => h.engine,
    resolveMode: async () => 'on_device',
    db: async () => h.db,
    worker: { kick: () => undefined, setLive: () => undefined },
    keepalive: { start: async () => undefined, stop: async () => undefined },
    loadServerSegments: async () => [],
    now: () => T0,
    schedule: () => () => undefined,
    newId: () => 'm1',
    translate: async (t) => t,
  };
}
