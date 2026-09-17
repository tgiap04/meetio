import { Redirect, Stack } from 'expo-router';
import { useSessionStore } from '../../src/store/session.store';
import { ROOT_ROUTE, shouldRedirectFromAuthGroup } from '../../src/navigation/route-guards';

/**
 * An already-authenticated user has no reason to see login/register again.
 * Redirects to `'/'`, NOT to `(app)` directly — `app/index.tsx` is the single
 * decision point (`resolveBootstrapRoute`) that then routes on to the mic
 * permission prompt or home. Redirecting straight to `(app)` here would skip
 * that prompt forever on first login (see decisions.md §2).
 */
export default function AuthGroupLayout() {
  const authStatus = useSessionStore((state) => state.authStatus);

  if (shouldRedirectFromAuthGroup(authStatus)) {
    return <Redirect href={ROOT_ROUTE} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
