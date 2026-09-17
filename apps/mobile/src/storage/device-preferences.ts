import * as SecureStore from 'expo-secure-store';

/**
 * Device-local onboarding/permission-prompt flags, kept in `expo-secure-store`
 * for the same practical reason as the token pair in `secure-store.ts`: it is
 * already a dependency with a Jest mock in place, so adding these two keys
 * costs nothing new (decisions.md §3). The values are not sensitive — this is
 * a convenience choice, not a security one.
 */
const ONBOARDING_COMPLETED_KEY = 'meetio.onboarding_completed';
const MIC_PROMPT_SEEN_KEY = 'meetio.mic_prompt_seen';
const TRUE_VALUE = '1';

export interface DevicePreferences {
  onboardingCompleted: boolean;
  micPromptSeen: boolean;
}

/**
 * Reads both device-local preference flags. Fails open to
 * `{ onboardingCompleted: false, micPromptSeen: false }` whenever the read
 * throws, or whenever a stored value is anything other than the exact `'1'`
 * sentinel (missing key, `null`, or corrupted data).
 *
 * This is a deliberate asymmetry: showing onboarding or the mic-permission
 * prompt once too often is a mild annoyance, while fail-closed (`true`) on a
 * corrupted read would hide the mic-permission screen with no way back to it.
 * Never rejects.
 */
export async function readDevicePreferences(): Promise<DevicePreferences> {
  try {
    const [onboardingCompleted, micPromptSeen] = await Promise.all([
      SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY),
      SecureStore.getItemAsync(MIC_PROMPT_SEEN_KEY),
    ]);

    return {
      onboardingCompleted: onboardingCompleted === TRUE_VALUE,
      micPromptSeen: micPromptSeen === TRUE_VALUE,
    };
  } catch {
    return { onboardingCompleted: false, micPromptSeen: false };
  }
}

export async function writeOnboardingCompleted(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, TRUE_VALUE);
}

export async function writeMicPromptSeen(): Promise<void> {
  await SecureStore.setItemAsync(MIC_PROMPT_SEEN_KEY, TRUE_VALUE);
}

/**
 * Deletes both flags, sending the next boot back to the start of the flow.
 *
 * This is the only way back to onboarding on iOS: `expo-secure-store` is backed
 * by the Keychain there, and Keychain items SURVIVE app deletion — reinstalling
 * does not clear them. (Android uses EncryptedSharedPreferences, which is wiped
 * with the app data, so uninstalling does reset it on that platform. The
 * asymmetry is the reason this function exists rather than "just reinstall".)
 *
 * Unlike `readDevicePreferences`, this one rejects on failure. A silent failure
 * would tell the caller the reset worked while the flags stay in the Keychain,
 * and they would be stuck again on the next launch with no signal why.
 */
export async function clearDevicePreferences(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ONBOARDING_COMPLETED_KEY),
    SecureStore.deleteItemAsync(MIC_PROMPT_SEEN_KEY),
  ]);
}
