import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessionStore } from '../store/session.store';
import { useLogoutMutation } from './use-auth-mutations';

/**
 * Proves the fix for the reviewed bug: `unregisterCurrentPushToken()` (the
 * `DELETE /users/me/push-tokens` call) must run — and see the still-valid
 * access token — BEFORE `clearTokens()` wipes it. Mocking `../api/auth` and
 * `../notifications/push-registration` directly (rather than the real
 * `apiClient` chain, already covered by `axios-client.test.ts` and
 * `push-tokens.test.ts`) isolates exactly the ordering this fix is about.
 */
jest.mock('../api/auth', () => ({
  logout: jest.fn().mockResolvedValue(undefined),
}));

let accessTokenAtUnregisterTime: string | null | undefined;
jest.mock('../notifications/push-registration', () => ({
  unregisterCurrentPushToken: jest.fn(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories run before imports are hoisted, see jest.setup.ts
    accessTokenAtUnregisterTime = require('../store/session.store').useSessionStore.getState().accessToken;
  }),
}));

import { logout as mockLogoutRequest } from '../api/auth';
import { unregisterCurrentPushToken } from '../notifications/push-registration';

const mockUnregister = unregisterCurrentPushToken as jest.Mock;

let hookResult: ReturnType<typeof useLogoutMutation>;

function Harness() {
  hookResult = useLogoutMutation();
  return null;
}

function renderHarness() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  return renderer;
}

describe('useLogoutMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessTokenAtUnregisterTime = undefined;
    useSessionStore.setState({
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      authStatus: 'authenticated',
    });
  });

  it('unregisters the push token while the access token is still present, before clearing tokens', async () => {
    renderHarness();

    await act(async () => {
      await hookResult.mutateAsync();
    });

    expect(mockUnregister).toHaveBeenCalledTimes(1);
    expect(accessTokenAtUnregisterTime).toBe('old-access-token');
    expect(useSessionStore.getState().accessToken).toBeNull();
    expect(useSessionStore.getState().authStatus).toBe('unauthenticated');
  });

  it('calls unregister before the /auth/logout request', async () => {
    const order: string[] = [];
    mockUnregister.mockImplementation(async () => {
      order.push('unregister');
    });
    (mockLogoutRequest as jest.Mock).mockImplementation(async () => {
      order.push('logout');
    });
    renderHarness();

    await act(async () => {
      await hookResult.mutateAsync();
    });

    expect(order).toEqual(['unregister', 'logout']);
  });

  it('still clears tokens even if unregistering the push token fails', async () => {
    mockUnregister.mockRejectedValueOnce(new Error('should not happen — unregister is best-effort internally'));
    renderHarness();

    // unregisterCurrentPushToken is documented as never-throwing in
    // production, but the mutation must not depend on that: if it somehow
    // rejects, logout must still complete rather than leaving the user
    // stuck "logged in".
    await act(async () => {
      await expect(hookResult.mutateAsync()).rejects.toThrow();
    });

    expect(useSessionStore.getState().accessToken).toBeNull();
  });
});
