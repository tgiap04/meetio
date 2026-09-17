import { useEffect } from 'react';
import { readDevicePreferences } from '../storage/device-preferences';
import { usePreferencesStore } from '../store/preferences.store';

/**
 * Reads the two device-local preference flags once, on mount, and resolves
 * `status` out of `'hydrating'`. Shaped identically to `useHydrateSession` —
 * this is the second of the splash gate's three conditions (decisions.md §1).
 *
 * `readDevicePreferences` itself never rejects (it fails open internally),
 * but the `.catch` here is kept anyway, mirroring `useHydrateSession`, so a
 * future change to that contract cannot silently leave `status` stuck on
 * `'hydrating'`.
 */
export function useHydratePreferences(): void {
  const finishHydration = usePreferencesStore((state) => state.finishHydration);

  useEffect(() => {
    let cancelled = false;

    readDevicePreferences()
      .then((prefs) => {
        if (!cancelled) {
          finishHydration(prefs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          finishHydration({ onboardingCompleted: false, micPromptSeen: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [finishHydration]);
}
