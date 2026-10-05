import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { useSessionStore } from '../../src/store/session.store';
import { LOGIN_ROUTE, shouldRedirectFromAppGroup } from '../../src/navigation/route-guards';
import { registerAppShortcuts } from '../../src/navigation/app-shortcuts';
import { useRecordingSync } from '../../src/hooks/use-recording-sync';
import { useWidgetSnapshotSync } from '../../src/hooks/use-widget-snapshot-sync';
import { AppLockGate } from '../../src/components/security/app-lock-gate';

/**
 * The `(app)` route group is the whole reason route guards exist: nothing under it
 * may render while the session is not authenticated. It is also where launcher shortcuts route
 * (expo-quick-actions must navigate from a sub-layout, not the root) and where the biometric lock
 * covers every signed-in screen.
 */
export default function AppGroupLayout() {
  const authStatus = useSessionStore((state) => state.authStatus);
  // Queued transcript keeps syncing on every screen, not only while the recording screen is open.
  useRecordingSync();
  // Home-screen widget mirrors the latest meeting, open to-dos and recording state.
  useWidgetSnapshotSync();
  useQuickActionRouting();
  useEffect(() => {
    void registerAppShortcuts();
  }, []);

  if (shouldRedirectFromAppGroup(authStatus)) {
    return <Redirect href={LOGIN_ROUTE} />;
  }

  return (
    <AppLockGate>
      <Stack screenOptions={{ headerShown: false }} />
    </AppLockGate>
  );
}
