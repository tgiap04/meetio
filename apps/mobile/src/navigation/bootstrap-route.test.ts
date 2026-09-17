import { resolveBootstrapRoute } from './bootstrap-route';
import { LOGIN_ROUTE, MIC_PERMISSION_ROUTE, ONBOARDING_ROUTE, APP_HOME_ROUTE } from './route-guards';

/**
 * The full 8-combination decision table from decisions.md §2 /
 * phase-05-bootstrap-routing.md. This is a bare, zero-mock unit test — the
 * whole point of `resolveBootstrapRoute` being a pure function.
 */
describe('resolveBootstrapRoute', () => {
  it.each([
    ['hydrating', false, false, ONBOARDING_ROUTE],
    ['unauthenticated', false, false, ONBOARDING_ROUTE],
    ['authenticated', false, false, ONBOARDING_ROUTE],
    ['authenticated', false, true, ONBOARDING_ROUTE],
    ['unauthenticated', true, false, LOGIN_ROUTE],
    ['hydrating', true, true, LOGIN_ROUTE],
    ['authenticated', true, false, MIC_PERMISSION_ROUTE],
    ['authenticated', true, true, APP_HOME_ROUTE],
  ] as const)(
    'authStatus=%s onboardingCompleted=%s micPromptSeen=%s -> %s',
    (authStatus, onboardingCompleted, micPromptSeen, expected) => {
      expect(
        resolveBootstrapRoute({ authStatus, onboardingCompleted, micPromptSeen }),
      ).toBe(expected);
    },
  );
});
