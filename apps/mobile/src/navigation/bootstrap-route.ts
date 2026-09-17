import type { AuthStatus } from '../store/session.store';

// Route literals are duplicated from `route-guards.ts` on purpose: this
// module imports ONLY types (see doc comment below and the file-level test),
// so it stays a bare, zero-mock unit — no Jest module mock required to test
// pure branching logic. `route-guards.ts` owns the canonical exported
// constants that the route components themselves use; keep these in sync
// with it (a 2-line diff either direction, caught immediately by
// bootstrap-route.test.ts and the app-index/auth-group redirect tests).
const ONBOARDING_ROUTE = '/onboarding';
const LOGIN_ROUTE = '/(auth)/login';
const MIC_PERMISSION_ROUTE = '/(app)/permission';
const APP_HOME_ROUTE = '/(app)';

/**
 * State the bootstrap resolver decides on. Deliberately narrow — only the
 * three device-local facts that decide where the app lands, nothing that
 * requires rendering to know.
 */
export interface BootstrapState {
  authStatus: AuthStatus;
  onboardingCompleted: boolean;
  micPromptSeen: boolean;
}

/**
 * The single source of truth for "where does the user land right now."
 * `app/index.tsx` is the ONLY place that calls this. Every other screen that
 * finishes a step (onboarding, login, the mic-permission prompt) must
 * `router.replace('/')` and let this function decide the next stop — never
 * navigate straight to a hardcoded "next" screen. That invariant is what
 * keeps adding a future gate (e.g. a notifications-permission screen) a
 * change to this one pure function instead of a hunt through every
 * `router.replace` call in the app.
 *
 * Order is fixed and matters: onboarding gates everything, then auth, then
 * the mic-permission prompt, then home. See decisions.md §2 for the full
 * 8-combination decision table and the redirect-loop proof.
 */
export function resolveBootstrapRoute(state: BootstrapState): string {
  if (!state.onboardingCompleted) {
    return ONBOARDING_ROUTE;
  }
  if (state.authStatus !== 'authenticated') {
    return LOGIN_ROUTE;
  }
  if (!state.micPromptSeen) {
    return MIC_PERMISSION_ROUTE;
  }
  return APP_HOME_ROUTE;
}
