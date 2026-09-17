import { Redirect, Stack } from 'expo-router';
import { useSessionStore } from '../../src/store/session.store';
import { APP_HOME_ROUTE, shouldRedirectFromAuthGroup } from '../../src/navigation/route-guards';

/** An already-authenticated user has no reason to see login/register again. */
export default function AuthGroupLayout() {
  const authStatus = useSessionStore((state) => state.authStatus);

  if (shouldRedirectFromAuthGroup(authStatus)) {
    return <Redirect href={APP_HOME_ROUTE} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
