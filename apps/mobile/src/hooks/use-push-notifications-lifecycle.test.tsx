import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications } from '../notifications/push-registration';
import { useSessionStore } from '../store/session.store';
import { MEETING_DETAIL_ROUTE } from '../navigation/app-routes';
import { usePushNotificationsLifecycle } from './use-push-notifications-lifecycle';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock('../notifications/push-registration', () => ({
  registerForPushNotifications: jest.fn().mockResolvedValue(undefined),
  unregisterCurrentPushToken: jest.fn().mockResolvedValue(undefined),
}));

const mockRemove = jest.fn();
let capturedHandler: ((response: unknown) => void) | undefined;
jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  addNotificationResponseReceivedListener: jest.fn((handler: (response: unknown) => void) => {
    capturedHandler = handler;
    return { remove: mockRemove };
  }),
}));

function Harness() {
  usePushNotificationsLifecycle();
  return null;
}

const renderers: TestRenderer.ReactTestRenderer[] = [];

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness />);
  });
  renderers.push(renderer);
  return renderer;
}

describe('usePushNotificationsLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ accessToken: null, refreshToken: null, authStatus: 'hydrating' });
    capturedHandler = undefined;
  });

  afterEach(() => {
    // Each Harness subscribes to the (module-global) Zustand store; leaving
    // one mounted past its test lets it keep reacting to later tests'
    // `setState` calls and double-counts the mocked side effects.
    while (renderers.length > 0) {
      act(() => renderers.pop()?.unmount());
    }
  });

  it('registers for push once the session becomes authenticated', () => {
    render();
    expect(registerForPushNotifications).not.toHaveBeenCalled();
    act(() => {
      useSessionStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' });
    });
    expect(registerForPushNotifications).toHaveBeenCalledTimes(1);
  });

  it('does NOT reactively unregister on logout — that call moved to the logout mutations themselves', () => {
    // Regression guard for the fixed bug: this hook used to call
    // `unregisterCurrentPushToken()` reactively here, but by the time it
    // observes `authStatus` flipping to `unauthenticated`, `clearTokens()`
    // has already run and the DELETE would always fail unauthenticated. See
    // `useLogoutMutation` / `useDeleteAccountMutation` for where it lives now.
    const unregisterCurrentPushToken = jest.requireMock('../notifications/push-registration')
      .unregisterCurrentPushToken as jest.Mock;
    useSessionStore.setState({ accessToken: 'a', refreshToken: 'r', authStatus: 'authenticated' });
    render();
    act(() => {
      useSessionStore.getState().clearTokens();
    });
    expect(unregisterCurrentPushToken).not.toHaveBeenCalled();
  });

  it('does not re-register on every render while already authenticated', () => {
    useSessionStore.setState({ accessToken: 'a', refreshToken: 'r', authStatus: 'authenticated' });
    const renderer = render();
    act(() => {
      renderer.update(<Harness />);
    });
    expect(registerForPushNotifications).not.toHaveBeenCalled();
  });

  it('navigates to meeting detail when a meeting_ready notification is tapped', () => {
    render();
    act(() => {
      capturedHandler?.({ notification: { request: { content: { data: { type: 'meeting_ready', meeting_id: 'm1' } } } } });
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'm1' } });
  });

  it('ignores a tapped notification with unrelated data', () => {
    render();
    act(() => {
      capturedHandler?.({ notification: { request: { content: { data: { type: 'something_else' } } } } });
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('handles a cold-start tap via getLastNotificationResponseAsync', async () => {
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue({
      notification: { request: { content: { data: { type: 'meeting_ready', meeting_id: 'cold-start' } } } },
    });
    await act(async () => {
      render();
      await Promise.resolve();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: MEETING_DETAIL_ROUTE, params: { id: 'cold-start' } });
  });

  it('removes the notification listener on unmount', () => {
    const renderer = render();
    act(() => renderer.unmount());
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
