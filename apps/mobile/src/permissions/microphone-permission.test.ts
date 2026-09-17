/**
 * Tests for the microphone permission wrapper.
 *
 * `expo-audio`'s own module-load code touches `AudioModule.AudioPlayer.prototype`
 * (see node_modules/expo-audio/src/ExpoAudio.ts), which jest-expo's native-module
 * mock does not provide — so importing the real package crashes at import time in
 * this Jest environment, before any test body runs. `jest-expo` does NOT usably
 * auto-mock `ExpoAudio` for this package's top-level export path, contrary to the
 * plan's working assumption; the documented fallback applies: mock it here, in
 * this test file only (never in the shared `jest.setup.ts`).
 *
 * `resolveMicPermissionView` itself is still exercised with zero mocking of its
 * own behavior — it is a pure function called with plain objects. The module
 * mock below exists solely to make the file importable in this environment.
 */
jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: jest.fn(),
  getRecordingPermissionsAsync: jest.fn(),
}));
jest.mock('expo-linking', () => ({
  openSettings: jest.fn(),
}));

import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { openSettings } from 'expo-linking';
import {
  openAppSettings,
  readMicrophonePermission,
  requestMicrophonePermission,
  resolveMicPermissionView,
} from './microphone-permission';

const mockRequest = requestRecordingPermissionsAsync as jest.Mock;
const mockRead = getRecordingPermissionsAsync as jest.Mock;
const mockOpenSettings = openSettings as jest.Mock;

afterEach(() => {
  mockRequest.mockReset();
  mockRead.mockReset();
  mockOpenSettings.mockReset();
});

describe('resolveMicPermissionView', () => {
  it('returns "granted" when permission is granted regardless of canAskAgain', () => {
    expect(resolveMicPermissionView({ granted: true, canAskAgain: true })).toBe('granted');
    expect(resolveMicPermissionView({ granted: true, canAskAgain: false })).toBe('granted');
  });

  it('returns "ask" when not granted but the system dialog can still be shown', () => {
    expect(resolveMicPermissionView({ granted: false, canAskAgain: true })).toBe('ask');
  });

  it('returns "blocked" when not granted and the dialog can no longer be shown (iOS re-deny)', () => {
    expect(resolveMicPermissionView({ granted: false, canAskAgain: false })).toBe('blocked');
  });
});

describe('requestMicrophonePermission', () => {
  it('reduces the expo-audio PermissionResponse to a snapshot', async () => {
    mockRequest.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });

    const snapshot = await requestMicrophonePermission();

    expect(snapshot).toEqual({ granted: true, canAskAgain: true });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});

describe('readMicrophonePermission', () => {
  it('reduces the expo-audio PermissionResponse to a snapshot', async () => {
    mockRead.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });

    const snapshot = await readMicrophonePermission();

    expect(snapshot).toEqual({ granted: false, canAskAgain: false });
    expect(mockRead).toHaveBeenCalledTimes(1);
  });
});

describe('openAppSettings', () => {
  it('calls expo-linking openSettings exactly once', async () => {
    mockOpenSettings.mockResolvedValue(undefined);

    await openAppSettings();

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });
});
