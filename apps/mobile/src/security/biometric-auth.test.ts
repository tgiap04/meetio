import * as LocalAuthentication from 'expo-local-authentication';
import { authenticate, canUseAppLock } from './biometric-auth';

const auth = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

describe('canUseAppLock', () => {
  it('is true when hardware exists and a credential is enrolled', async () => {
    await expect(canUseAppLock()).resolves.toBe(true);
  });

  it('is true for a PIN-only phone (SECRET level)', async () => {
    auth.getEnrolledLevelAsync.mockResolvedValueOnce(LocalAuthentication.SecurityLevel.SECRET);
    await expect(canUseAppLock()).resolves.toBe(true);
  });

  it('is false when nothing is enrolled', async () => {
    auth.getEnrolledLevelAsync.mockResolvedValueOnce(LocalAuthentication.SecurityLevel.NONE);
    await expect(canUseAppLock()).resolves.toBe(false);
  });

  it('is false when the hardware check throws', async () => {
    auth.hasHardwareAsync.mockRejectedValueOnce(new Error('native'));
    await expect(canUseAppLock()).resolves.toBe(false);
  });
});

describe('authenticate', () => {
  it('resolves the prompt outcome', async () => {
    await expect(authenticate('x')).resolves.toBe(true);
    auth.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    await expect(authenticate('x')).resolves.toBe(false);
  });

  it('resolves false instead of rejecting on a native error', async () => {
    auth.authenticateAsync.mockRejectedValueOnce(new Error('lockout'));
    await expect(authenticate('x')).resolves.toBe(false);
  });

  it('keeps the device-credential fallback enabled', async () => {
    await authenticate('Mở khoá');
    expect(auth.authenticateAsync).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ disableDeviceFallback: true }),
    );
  });
});
