import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { shouldLockOnResume } from '../security/app-lock-policy';
import { useAppLockStore } from '../security/app-lock.store';
import { setRecentsHidden } from '../../modules/recents-privacy';

/**
 * Hydrates the app-lock flag and re-locks after a long enough stay in the background.
 * `isPrompting` tells it to ignore AppState churn the system prompt itself causes — some Android
 * builds send the activity to `background` while BiometricPrompt is up, which would otherwise
 * re-lock the app the instant the user unlocks it.
 * While the lock is on, the app's thumbnail in the app switcher is blanked too — otherwise the
 * last meeting on screen would sit there in plain sight behind the lock.
 */
export function useAppLockLifecycle(isPrompting: () => boolean, now: () => number = Date.now): void {
  const hydrate = useAppLockStore((s) => s.hydrate);
  const lock = useAppLockStore((s) => s.lock);
  const enabled = useAppLockStore((s) => s.enabled);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    void setRecentsHidden(enabled);
  }, [enabled]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // A widget or shortcut launch can hand us a fresh Activity that never got the flag.
      if (state === 'active') void setRecentsHidden(useAppLockStore.getState().enabled);
      if (isPrompting()) return;
      if (state === 'background') {
        backgroundedAt.current = now();
      } else if (state === 'active') {
        if (shouldLockOnResume(backgroundedAt.current, now())) lock();
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [isPrompting, lock, now]);
}
