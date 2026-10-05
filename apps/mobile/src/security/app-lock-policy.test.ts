import { LOCK_AFTER_BACKGROUND_MS, shouldLockOnResume } from './app-lock-policy';

describe('shouldLockOnResume', () => {
  it('does not lock when the app never went to the background', () => {
    expect(shouldLockOnResume(null, 1_000_000)).toBe(false);
  });

  it('does not lock after a short trip to another app', () => {
    expect(shouldLockOnResume(0, LOCK_AFTER_BACKGROUND_MS - 1)).toBe(false);
  });

  it('locks once the background stay reaches the threshold', () => {
    expect(shouldLockOnResume(0, LOCK_AFTER_BACKGROUND_MS)).toBe(true);
    expect(shouldLockOnResume(0, LOCK_AFTER_BACKGROUND_MS * 10)).toBe(true);
  });

  it('honours a custom threshold', () => {
    expect(shouldLockOnResume(100, 150, 50)).toBe(true);
    expect(shouldLockOnResume(100, 149, 50)).toBe(false);
  });
});
