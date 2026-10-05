import { jest } from '@jest/globals';
import { M, target, fakeStore, echoModel, setup, settle } from './__tests__/translation-test-kit.js';

describe('TranslationService defaults and settings cache', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('defaults to a 4s window / 8 segments when not configured, and honours env overrides', async () => {
    const t = setup(echoModel, fakeStore(), {});
    t.service.enqueue(M, [1]);
    await jest.advanceTimersByTimeAsync(3900);
    expect(t.calls).toEqual([]);
    await jest.advanceTimersByTimeAsync(300);
    expect(t.calls).toEqual([[1]]);
    [2, 3, 4, 5, 6, 7, 8, 9].forEach((s) => t.service.enqueue(M, [s]));
    await jest.advanceTimersByTimeAsync(50);
    expect(t.calls).toEqual([[1], [2, 3, 4, 5, 6, 7, 8, 9]]);
    const fast = setup(echoModel, fakeStore(), { TRANSLATION_BATCH_WINDOW_MS: '100', TRANSLATION_BATCH_MAX: '2' });
    [1, 2, 3].forEach((s) => fast.service.enqueue(M, [s]));
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(150);
    expect(fast.calls).toEqual([[1, 2], [3]]);
  });

  it('reads the meeting settings once per ~30s, also when translation is off (no DB hit per ingested segment)', async () => {
    const off = setup(echoModel, fakeStore({ ...target, translateTo: null }));
    for (const s of [1, 2, 3]) off.service.enqueue(M, [s]);
    await jest.advanceTimersByTimeAsync(10);
    expect(off.store.targetFor).toHaveBeenCalledTimes(1);
    expect(off.store.untranslated).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(31_000);
    off.service.enqueue(M, [4]);
    await jest.advanceTimersByTimeAsync(10);
    expect(off.store.targetFor).toHaveBeenCalledTimes(2);
  });

  it('forget() drops the cached settings so switching translation on takes effect at once', async () => {
    const t = setup(echoModel, fakeStore({ ...target, translateTo: null }));
    t.service.enqueue(M, [1]);
    await jest.advanceTimersByTimeAsync(10);
    t.store.meeting = target;
    t.service.forget(M);
    t.service.enqueue(M, [2]);
    await settle();
    expect(t.calls).toEqual([[2]]);
  });
});
