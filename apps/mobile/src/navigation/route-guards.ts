import type { AuthStatus } from '../store/session.store';

/**
 * Pure routing-guard predicates, kept separate from the Expo Router layout
 * components so the branching logic itself — the thing that makes `(app)`
 * unreachable while logged out — can be unit tested without rendering a full
 * navigation tree.
 */
export const LOGIN_ROUTE = '/(auth)/login';
export const APP_HOME_ROUTE = '/(app)';
export const ROOT_ROUTE = '/';
export const ONBOARDING_ROUTE = '/onboarding';
export const MIC_PERMISSION_ROUTE = '/(app)/permission';

/** `(app)` group: redirect to login unless a session is confirmed authenticated. */
export function shouldRedirectFromAppGroup(authStatus: AuthStatus): boolean {
  return authStatus !== 'authenticated';
}

/** `(auth)` group: an already-authenticated user has no business on login/register. */
export function shouldRedirectFromAuthGroup(authStatus: AuthStatus): boolean {
  return authStatus === 'authenticated';
}
