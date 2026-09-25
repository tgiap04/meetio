import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { registerPushToken, unregisterPushToken } from '../api/push-tokens';

/**
 * Foreground presentation: still show the OS banner/sound while the app is
 * open, so a `meeting_ready` push isn't silently swallowed just because the
 * user happens to be looking at the app right then.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * The repo has no EAS project configured yet (per the phase's task brief) —
 * `Constants.expoConfig?.extra?.eas?.projectId` will be undefined until one
 * is. `EXPO_PUBLIC_EAS_PROJECT_ID` is the escape hatch for local/dev builds
 * that set it directly without a full `eas.json`.
 */
function resolveProjectId(): string | undefined {
  const configuredId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  return configuredId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

function resolvePlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** Bounds how long a caller on the logout path can be blocked waiting on this
 *  best-effort cleanup — a hung network call must never hang logout itself. */
const UNREGISTER_TIMEOUT_MS = 3_000;

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  // Whichever of `promise`/`timeout` wins, clear the other's timer so a fast
  // real network call doesn't leave a dangling 3s timeout behind it.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Requests notification permission (if not already decided) and registers
 * this device's Expo push token with the server (US-30). Never throws —
 * every way this can fail to complete (no project id, permission denied, a
 * network error registering the token) is logged and swallowed, because push
 * registration is a nice-to-have that must never block app boot or login.
 */
export async function registerForPushNotifications(): Promise<void> {
  const projectId = resolveProjectId();
  if (!projectId) {
    console.warn('[push] no EAS project id configured — skipping push registration.');
    return;
  }

  try {
    const current = await Notifications.getPermissionsAsync();
    const status =
      current.status === 'granted' ? current.status : (await Notifications.requestPermissionsAsync()).status;

    if (status !== 'granted') {
      console.warn('[push] notification permission not granted — skipping push registration.');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken({ token, platform: resolvePlatform() });
  } catch (error) {
    console.warn('[push] failed to register for push notifications', error);
  }
}

/**
 * Best-effort: unregisters this device's token so a signed-out device stops
 * receiving another account's `meeting_ready` pushes.
 *
 * MUST be called by the caller BEFORE it clears the access token — this
 * function has no way to supply its own credentials, it goes through the
 * shared `apiClient`, which reads whatever token the session store holds at
 * request time. Calling this reactively *after* `clearTokens()` (as an
 * earlier version of this codebase did, from `usePushNotificationsLifecycle`)
 * means the `DELETE` always goes out unauthenticated and always fails —
 * exactly the bug this comment exists to prevent reintroducing. See
 * `useLogoutMutation` / `useDeleteAccountMutation` for the correct call site.
 *
 * Bounded by `UNREGISTER_TIMEOUT_MS` so a slow/hung network call can never
 * hang the logout flow that awaits this.
 */
export async function unregisterCurrentPushToken(): Promise<void> {
  const projectId = resolveProjectId();
  if (!projectId) {
    return;
  }

  await withTimeout(
    (async () => {
      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        await unregisterPushToken({ token });
      } catch (error) {
        console.warn('[push] failed to unregister push token', error);
      }
    })(),
    UNREGISTER_TIMEOUT_MS,
  );
}
