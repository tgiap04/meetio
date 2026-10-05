import * as SecureStore from 'expo-secure-store';

/**
 * Device-local "lock the app with biometrics" flag. Same storage and `'1'` sentinel as
 * `device-preferences.ts`; kept apart because it is a security setting with its own store, not a
 * boot-flow flag. Like those flags it survives logout — it belongs to the phone, not the account.
 */
const APP_LOCK_ENABLED_KEY = 'meetio.app_lock_enabled';
const TRUE_VALUE = '1';

/**
 * Fails open to `false`: the lock is a convenience layer over a device that already has its own
 * screen lock, and fail-closed on a corrupted read would leave no way past the lock screen.
 */
export async function readAppLockEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(APP_LOCK_ENABLED_KEY)) === TRUE_VALUE;
  } catch {
    return false;
  }
}

export async function writeAppLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync(APP_LOCK_ENABLED_KEY, TRUE_VALUE);
  else await SecureStore.deleteItemAsync(APP_LOCK_ENABLED_KEY);
}
