import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * Proves the `(app)` route group itself is unreachable while logged out —
 * the acceptance criterion from phase-06-mobile-foundation.md. `Redirect` and
 * `Stack` are mocked to bare markers so this stays a unit test of the guard
 * wiring, not a full navigation-stack render.
 *
 * Mock variables must be prefixed with `mock` (case-insensitive) — Jest's
 * out-of-scope check for `jest.mock()` factories only allows that naming.
 *
 * This file must stay OUT of `app/`. Expo Router turns every file under `app/`
 * into a route, so living next to `_layout.tsx` made it collide on the route
 * `/(app)/_layout` and dragged Jest globals into the app bundle — the running
 * app crashed with "Property 'jest' doesn't exist". Typecheck, lint and the
 * test run all stayed green; only launching the app surfaced it.
 */
const mockRedirect = jest.fn((_props: { href: string }) => null);
const mockStack = jest.fn((_props: unknown) => null);

jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
  Stack: (props: unknown) => mockStack(props),
}));

jest.mock('../store/session.store', () => ({
  useSessionStore: jest.fn(),
}));

import { useSessionStore } from '../store/session.store';
import { LOGIN_ROUTE } from './route-guards';
import AppGroupLayout from '../../app/(app)/_layout';

const mockedUseSessionStore = useSessionStore as unknown as jest.Mock;

function renderWithAuthStatus(authStatus: 'hydrating' | 'authenticated' | 'unauthenticated') {
  mockedUseSessionStore.mockImplementation((selector: (state: { authStatus: string }) => unknown) =>
    selector({ authStatus }),
  );
  return act(() => {
    TestRenderer.create(<AppGroupLayout />);
  });
}

describe('(app) group layout guard', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockStack.mockClear();
  });

  it('redirects to login when the session is unauthenticated', () => {
    renderWithAuthStatus('unauthenticated');

    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: LOGIN_ROUTE }));
    expect(mockStack).not.toHaveBeenCalled();
  });

  it('redirects to login while the session is still hydrating', () => {
    renderWithAuthStatus('hydrating');

    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: LOGIN_ROUTE }));
    expect(mockStack).not.toHaveBeenCalled();
  });

  it('renders the app Stack once authenticated', () => {
    renderWithAuthStatus('authenticated');

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });
});
