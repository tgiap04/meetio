import { Redirect, Stack } from 'expo-router';
import { useSessionStore } from '../../src/store/session.store';
import { LOGIN_ROUTE, shouldRedirectFromAppGroup } from '../../src/navigation/route-guards';
import { useRecordingSync } from '../../src/hooks/use-recording-sync';

/**
 * The `(app)` group is the whole reason route guards exist: nothing under it
 * may render while the session is not authenticated.
 */
export default function AppGroupLayout() {
  const authStatus = useSessionStore((state) => state.authStatus);
  // Queued transcript keeps syncing on every screen, not only while the recording screen is open.
  useRecordingSync();

  if (shouldRedirectFromAppGroup(authStatus)) {
    return <Redirect href={LOGIN_ROUTE} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
