import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications } from '../notifications/push-registration';
import { isMeetingReadyPushData } from '../notifications/meeting-ready-push-data';
import { useSessionStore, type AuthStatus } from '../store/session.store';
import { MEETING_DETAIL_ROUTE } from '../navigation/app-routes';

/**
 * Registers this device for push (US-30) once the session becomes
 * authenticated, and opens the tapped meeting's detail screen when a
 * `meeting_ready` push is tapped (including a cold start from a tap, via
 * `getLastNotificationResponseAsync`). Call once from the root layout — it
 * has no return value, it's a side-effect hook.
 *
 * Unregistering on logout does NOT live here, deliberately: this hook only
 * observes `authStatus` reactively, and by the time it sees the transition to
 * `unauthenticated`, `clearTokens()` has already run and wiped the access
 * token the `DELETE /users/me/push-tokens` call needs — the request would go
 * out unauthenticated and fail every time (caught during review). Instead,
 * `useLogoutMutation` and `useDeleteAccountMutation` call
 * `unregisterCurrentPushToken()` themselves, before they clear tokens, while
 * the session is still valid.
 */
export function usePushNotificationsLifecycle(): void {
  const authStatus = useSessionStore((state) => state.authStatus);
  const previousAuthStatus = useRef<AuthStatus>(authStatus);

  useEffect(() => {
    if (authStatus === 'authenticated' && previousAuthStatus.current !== 'authenticated') {
      registerForPushNotifications();
    }
    previousAuthStatus.current = authStatus;
  }, [authStatus]);

  useEffect(() => {
    function handleResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data;
      if (isMeetingReadyPushData(data)) {
        router.push({ pathname: MEETING_DETAIL_ROUTE, params: { id: data.meeting_id } });
      }
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleResponse(response);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, []);
}
