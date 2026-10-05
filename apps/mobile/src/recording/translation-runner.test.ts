import { openNodeSqliteDb } from '../queue/test-support/node-sqlite-db';
import { insertLocalMeeting } from '../queue/local-meetings';
import { listUnsyncedTranslations } from '../queue/translation-queue';
import { createTranslationRunner, TRANSLATE_TIMEOUT_MS } from './translation-runner';
import { resetRecordingStore, useRecordingStore } from './recording.store';

const BODY = { source_language: 'vi-VN', translate_to: 'en-US', audio_source: 'device_mic', recording_quality: 'high' } as const;

describe('translation runner watchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetRecordingStore();
    useRecordingStore.setState({ meetingId: 'm1' });
  });
  afterEach(() => jest.useRealTimers());

  it('a translation that never settles fails after 30s, later lines still translate, and settled() resolves', async () => {
    const db = openNodeSqliteDb();
    await insertLocalMeeting(db, { id: 'm1', ownerId: 'u1', startedAt: 1, createBody: BODY });
    const translate = jest.fn((text: string) => (text === 'treo' ? new Promise<string>(() => undefined) : Promise.resolve(`en:${text}`)));
    const runner = createTranslationRunner({ translate, db: async () => db, worker: { kick: jest.fn() } });

    void runner.translateLine('m1', 1, 'treo', 'vi-VN', 'en-US');
    void runner.translateLine('m1', 2, 'tiếp', 'vi-VN', 'en-US');
    let settled = false;
    void runner.settled().then(() => (settled = true));

    await jest.advanceTimersByTimeAsync(TRANSLATE_TIMEOUT_MS - 1);
    expect(useRecordingStore.getState().translations[1]).toEqual({ status: 'pending' });
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(2);
    await jest.advanceTimersByTimeAsync(0);
    expect(useRecordingStore.getState().translations[1]).toEqual({ status: 'failed' });
    expect(useRecordingStore.getState().translations[2]).toEqual({ status: 'done', text: 'en:tiếp', to: 'en-US' });
    expect(settled).toBe(true);
    db.close();
  });

  it('a translation that finishes in time leaves no timer behind', async () => {
    const db = openNodeSqliteDb();
    await insertLocalMeeting(db, { id: 'm1', ownerId: 'u1', startedAt: 1, createBody: BODY });
    const runner = createTranslationRunner({ translate: async (t) => t, db: async () => db, worker: { kick: jest.fn() } });
    await runner.translateLine('m1', 1, 'x', 'vi-VN', 'en-US');
    expect(jest.getTimerCount()).toBe(0);
    expect(await listUnsyncedTranslations(db, 'm1')).toHaveLength(1);
    db.close();
  });
});
