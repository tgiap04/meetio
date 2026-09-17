import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import {
  openAppSettings,
  readMicrophonePermission,
  requestMicrophonePermission,
  resolveMicPermissionView,
  type AskOrBlockedView,
} from '../permissions/microphone-permission';
import { usePreferencesStore } from '../store/preferences.store';
import { ROOT_ROUTE } from '../navigation/route-guards';

export interface UseMicrophonePermissionResult {
  view: AskOrBlockedView;
  isBusy: boolean;
  onPrimaryPress: () => Promise<void>;
  onDefer: () => void;
}

/**
 * Drives `app/(app)/permission.tsx`. Answers exactly one question — has the
 * user been asked — never whether the mic is currently usable (decisions.md
 * §4). Every exit calls `markMicPromptSeen` then replaces to `ROOT_ROUTE`, in
 * that order: the flag flips synchronously in the store before the
 * (fire-and-forget, error-swallowing) disk write, so a slow or failed write
 * can never trap the user on this screen.
 */
export function useMicrophonePermission(): UseMicrophonePermissionResult {
  // Narrowed to what the screen renders: every 'granted' resolution finishes and
  // navigates away, so it is never held as view state.
  const [view, setView] = useState<AskOrBlockedView>('ask');
  const [isBusy, setIsBusy] = useState(true);
  const markMicPromptSeen = usePreferencesStore((state) => state.markMicPromptSeen);

  const finish = useCallback(() => {
    markMicPromptSeen();
    router.replace(ROOT_ROUTE);
  }, [markMicPromptSeen]);

  useEffect(() => {
    let cancelled = false;
    readMicrophonePermission().then((snapshot) => {
      if (cancelled) {
        return;
      }
      const resolved = resolveMicPermissionView(snapshot);
      if (resolved === 'granted') {
        finish();
        return;
      }
      setView(resolved);
      setIsBusy(false);
    });
    return () => {
      cancelled = true;
    };
    // Intentionally mount-only: re-reading on every `finish` identity change
    // would re-trigger the permission check after the screen already left.
  }, []);

  const onPrimaryPress = useCallback(async () => {
    if (view === 'blocked') {
      await openAppSettings();
      finish();
      return;
    }
    setIsBusy(true);
    const snapshot = await requestMicrophonePermission();
    const resolved = resolveMicPermissionView(snapshot);
    if (resolved === 'granted') {
      finish();
      return;
    }
    // Still 'ask' (Android's first denial) or now 'blocked' (iOS, or
    // Android's second denial) — either way the user stays on this screen.
    setView(resolved);
    setIsBusy(false);
  }, [view, finish]);

  const onDefer = useCallback(() => {
    finish();
  }, [finish]);

  return { view, isBusy, onPrimaryPress, onDefer };
}
