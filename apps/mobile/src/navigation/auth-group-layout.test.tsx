import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * Regression guard for the bug phase-05 fixes: `(auth)/_layout.tsx` must
 * redirect an authenticated user to `'/'`, never straight to `/(app)`.
 * Redirecting to `/(app)` directly would skip `app/index.tsx` — the single
 * place `resolveBootstrapRoute` decides whether the mic-permission prompt
 * still needs showing — and permanently skip that prompt on first login.
 *
 * `Redirect` / `Stack` mocked to bare markers, same approach as
 * `app-group-layout.test.tsx`. This file must stay OUT of `app/` — see that
 * file's note on the Expo Router route collision this avoids.
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
import { ROOT_ROUTE } from './route-guards';
import AuthGroupLayout from '../../app/(auth)/_layout';

const mockedUseSessionStore = useSessionStore as unknown as jest.Mock;

function renderWithAuthStatus(authStatus: 'hydrating' | 'authenticated' | 'unauthenticated') {
  mockedUseSessionStore.mockImplementation((selector: (state: { authStatus: string }) => unknown) =>
    selector({ authStatus }),
  );
  return act(() => {
    TestRenderer.create(<AuthGroupLayout />);
  });
}

describe('(auth) group layout guard', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockStack.mockClear();
  });

  it('redirects an authenticated user to the root route, not /(app)', () => {
    renderWithAuthStatus('authenticated');

    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: ROOT_ROUTE }));
    expect(mockRedirect).not.toHaveBeenCalledWith(expect.objectContaining({ href: '/(app)' }));
    expect(mockStack).not.toHaveBeenCalled();
  });

  it('renders the auth Stack when unauthenticated', () => {
    renderWithAuthStatus('unauthenticated');

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('renders the auth Stack while the session is still hydrating', () => {
    renderWithAuthStatus('hydrating');

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });
});
