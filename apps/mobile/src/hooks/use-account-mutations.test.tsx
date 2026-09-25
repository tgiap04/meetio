import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessionStore } from '../store/session.store';
import { useDeleteAccountMutation } from './use-account-mutations';

/**
 * Same ordering requirement as `use-auth-mutations.test.tsx`: account
 * deletion also revokes the session, so its push-token unregister call must
 * run before `clearTokens()` too, not just the plain logout path.
 */
jest.mock('../api/users', () => ({
  deleteMe: jest.fn().mockResolvedValue(undefined),
}));

let accessTokenAtUnregisterTime: string | null | undefined;
jest.mock('../notifications/push-registration', () => ({
  unregisterCurrentPushToken: jest.fn(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories run before imports are hoisted, see jest.setup.ts
    accessTokenAtUnregisterTime = require('../store/session.store').useSessionStore.getState().accessToken;
  }),
}));

import { deleteMe as mockDeleteMe } from '../api/users';
import { unregisterCurrentPushToken } from '../notifications/push-registration';

const mockUnregister = unregisterCurrentPushToken as jest.Mock;

let hookResult: ReturnType<typeof useDeleteAccountMutation>;

function Harness() {
  hookResult = useDeleteAccountMutation();
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

describe('useDeleteAccountMutation', () => {
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
      await hookResult.mutateAsync({ password: 'hunter2' });
    });

    expect(mockUnregister).toHaveBeenCalledTimes(1);
    expect(accessTokenAtUnregisterTime).toBe('old-access-token');
    expect(useSessionStore.getState().accessToken).toBeNull();
  });

  it('calls unregister before deleteMe', async () => {
    const order: string[] = [];
    mockUnregister.mockImplementation(async () => {
      order.push('unregister');
    });
    (mockDeleteMe as jest.Mock).mockImplementation(async () => {
      order.push('deleteMe');
    });
    renderHarness();

    await act(async () => {
      await hookResult.mutateAsync({ password: 'hunter2' });
    });

    expect(order).toEqual(['unregister', 'deleteMe']);
  });
});
