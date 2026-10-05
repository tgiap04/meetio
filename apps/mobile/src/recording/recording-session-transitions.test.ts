import { openNodeSqliteDb } from '../queue/test-support/node-sqlite-db';
import { createRecordingSession, type RecordingSessionDeps } from './recording-session';
import { resetRecordingStore, useRecordingStore } from './recording.store';
import type { SttEngine } from './stt-engine';

/**
 * pause / resume / end are driven by three sources at once — the screen, the notification buttons
 * and phone calls. These cases pin the session's own serialization: each transition reads the
 * phase on its turn, never on the stale value from when it was requested.
 */
const SETTINGS = { ownerId: 'u1', language: 'vi-VN', audioSource: 'device_mic', quality: 'high', mode: 'on_device' } as const;

function setup() {
  const db = openNodeSqliteDb();
  let starts = 0;
  const engine: SttEngine = { start: () => void (starts += 1), stop: () => undefined, subscribe: () => () => undefined };
  let now = Date.UTC(2026, 9, 5, 9, 0, 0);
  const deps: RecordingSessionDeps = {
    engineFor: () => engine,
    resolveMode: async () => 'on_device',
    db: async () => db,
    worker: { kick: () => undefined, setLive: () => undefined },
    keepalive: { start: async () => undefined, stop: async () => undefined },
    loadServerSegments: async () => [],
    now: () => (now += 1_000),
    schedule: () => () => undefined,
    newId: () => 'meeting-1',
  };
  return { session: createRecordingSession(deps), micStarts: () => starts };
}

describe('recording session transitions', () => {
  beforeEach(() => resetRecordingStore());

  it('pause reports whether it was the call that paused', async () => {
    const { session } = setup();
    await session.start(SETTINGS);
    await expect(session.pause()).resolves.toBe(true);
    await expect(session.pause()).resolves.toBe(false);
  });

  it('two pauses requested together pause once; the second sees it already paused', async () => {
    const { session } = setup();
    await session.start(SETTINGS);
    const [first, second] = await Promise.all([session.pause(), session.pause()]);
    expect([first, second]).toEqual([true, false]);
    expect(useRecordingStore.getState().phase).toBe('paused');
  });

  it('an end requested while a resume is in flight wins — recognition does not restart after end', async () => {
    const { session, micStarts } = setup();
    await session.start(SETTINGS);
    await session.pause();
    const startsBefore = micStarts();
    const resumed = session.resume();
    const ended = session.end();
    await Promise.all([resumed, ended]);
    expect(useRecordingStore.getState().phase).toBe('ending');
    // The resume ran first (it was asked first) and the end then stopped it — nothing after the end.
    const late = session.resume();
    await late;
    expect(useRecordingStore.getState().phase).toBe('ending');
    expect(micStarts()).toBeLessThanOrEqual(startsBefore + 1);
  });

  it('End tapped while a pause is still flushing still ends the meeting', async () => {
    const { session } = setup();
    await session.start(SETTINGS);
    const paused = session.pause();
    const ended = session.end();
    await Promise.all([paused, ended]);
    expect(useRecordingStore.getState().phase).toBe('ending');
  });

  it('a transition that had nothing to do does not jam the ones queued behind it', async () => {
    const { session } = setup();
    // Not started: end is a no-op, then a real meeting still pauses normally.
    await session.end();
    await session.start(SETTINGS);
    await expect(session.pause()).resolves.toBe(true);
  });
});
