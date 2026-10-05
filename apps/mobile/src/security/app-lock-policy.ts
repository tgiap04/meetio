/** How long the app may sit in the background before coming back to it asks for the fingerprint again. */
export const LOCK_AFTER_BACKGROUND_MS = 30_000;

/**
 * Whether returning to the foreground re-locks the app. `backgroundedAt` is null when the app never
 * left the foreground (or the timestamp was consumed) — nothing to lock then.
 */
export function shouldLockOnResume(
  backgroundedAt: number | null,
  now: number,
  thresholdMs: number = LOCK_AFTER_BACKGROUND_MS,
): boolean {
  if (backgroundedAt === null) return false;
  return now - backgroundedAt >= thresholdMs;
}
