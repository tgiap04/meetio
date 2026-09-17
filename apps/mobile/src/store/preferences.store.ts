import { create } from 'zustand';
import type { DevicePreferences } from '../storage/device-preferences';
import {
  clearDevicePreferences,
  writeMicPromptSeen,
  writeOnboardingCompleted,
} from '../storage/device-preferences';

/**
 * Zustand preferences store — DEVICE-LOCAL STATE ONLY.
 *
 * Mirrors the invariant documented in `session.store.ts`: this store must
 * never hold data that came back from the API. `onboardingCompleted` and
 * `micPromptSeen` are per-installation facts, not session facts — they are
 * deliberately left untouched on logout (decisions.md §3), unlike the token
 * pair in `session.store.ts`.
 */
export type PreferencesStatus = 'hydrating' | 'ready';

interface PreferencesState {
  status: PreferencesStatus;
  onboardingCompleted: boolean;
  micPromptSeen: boolean;
  finishHydration: (prefs: DevicePreferences) => void;
  markOnboardingCompleted: () => void;
  markMicPromptSeen: () => void;
  reset: () => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  status: 'hydrating',
  onboardingCompleted: false,
  micPromptSeen: false,
  finishHydration: (prefs) =>
    set({
      status: 'ready',
      onboardingCompleted: prefs.onboardingCompleted,
      micPromptSeen: prefs.micPromptSeen,
    }),
  markOnboardingCompleted: () => {
    // Order matters: flip state first (synchronous, cannot fail), THEN fire
    // the persistence write and swallow its error. A caller navigates right
    // after this returns — if it awaited the write first, a hung Keychain
    // would trap the user in onboarding forever (decisions.md §3).
    set({ onboardingCompleted: true });
    writeOnboardingCompleted().catch(() => {});
  },
  markMicPromptSeen: () => {
    set({ micPromptSeen: true });
    writeMicPromptSeen().catch(() => {});
  },
  /**
   * Sends the app back to the top of the flow: onboarding, then the mic
   * prompt. State flips synchronously for the same reason as the `mark*`
   * actions — the caller navigates to `/` immediately after, and
   * `resolveBootstrapRoute` reads this state, not the Keychain.
   *
   * The returned promise is deliberately NOT swallowed here, unlike the
   * `mark*` writes. Those fail harmlessly (a screen shows once more); a failed
   * delete leaves the flags set, so the reset silently un-does itself on the
   * next launch. The caller is the only one who can report that.
   */
  reset: () => {
    set({ onboardingCompleted: false, micPromptSeen: false });
    return clearDevicePreferences();
  },
}));
