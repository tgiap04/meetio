import * as LocalAuthentication from 'expo-local-authentication';

/**
 * BiometricPrompt via expo-local-authentication. A phone with only a PIN/pattern reports
 * `SecurityLevel.SECRET` and the prompt falls back to it — so "can use the lock" means any enrolled
 * credential, not strictly a fingerprint. `disableDeviceFallback` stays off for the same reason:
 * with it on, a PIN-only phone could never unlock.
 */
export async function canUseAppLock(): Promise<boolean> {
  try {
    const [hardware, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    return hardware && level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/** Shows the system prompt. Resolves false on cancel, lockout or any native error — never rejects. */
export async function authenticate(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Huỷ',
    });
    return result.success;
  } catch {
    return false;
  }
}
