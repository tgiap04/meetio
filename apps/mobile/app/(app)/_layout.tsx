import { Redirect, Stack } from 'expo-router';
import { useSessionStore } from '../../src/store/session.store';
import { LOGIN_ROUTE, shouldRedirectFromAppGroup } from '../../src/navigation/route-guards';

/**
 * The `(app)` group is the whole reason route guards exist: nothing under it
 * may render while the session is not authenticated.
 */
export default function AppGroupLayout() {
  const authStatus = useSessionStore((state) => state.authStatus);

  if (shouldRedirectFromAppGroup(authStatus)) {
    return <Redirect href={LOGIN_ROUTE} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
