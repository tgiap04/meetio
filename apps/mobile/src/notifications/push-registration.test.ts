import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerPushToken, unregisterPushToken } from '../api/push-tokens';
import { registerForPushNotifications, unregisterCurrentPushToken } from './push-registration';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock('../api/push-tokens', () => ({
  registerPushToken: jest.fn(),
  unregisterPushToken: jest.fn(),
}));

const mockedGetPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockedRequestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const mockedGetToken = Notifications.getExpoPushTokenAsync as jest.Mock;
const mockedRegister = registerPushToken as jest.Mock;
const mockedUnregister = unregisterPushToken as jest.Mock;

describe('registerForPushNotifications', () => {
  const originalEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    (Constants as unknown as { expoConfig: { extra: Record<string, unknown> } }).expoConfig = { extra: {} };
    delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    } else {
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID = originalEnv;
    }
  });

  it('skips registration and warns when there is no project id configured', async () => {
    await registerForPushNotifications();
    expect(mockedGetPermissions).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no EAS project id'));
  });

  it('uses EXPO_PUBLIC_EAS_PROJECT_ID as a fallback when expoConfig has none', async () => {
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID = 'env-project-id';
    mockedGetPermissions.mockResolvedValue({ status: 'granted' });
    mockedGetToken.mockResolvedValue({ data: 'ExponentPushToken[abc]' });

    await registerForPushNotifications();

    expect(mockedGetToken).toHaveBeenCalledWith({ projectId: 'env-project-id' });
    expect(mockedRegister).toHaveBeenCalledWith({ token: 'ExponentPushToken[abc]', platform: expect.any(String) });
  });

  it('requests permission when not already granted, then registers on success', async () => {
    (Constants as unknown as { expoConfig: { extra: { eas: { projectId: string } } } }).expoConfig = {
      extra: { eas: { projectId: 'proj-1' } },
    };
    mockedGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockedRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockedGetToken.mockResolvedValue({ data: 'ExponentPushToken[xyz]' });

    await registerForPushNotifications();

    expect(mockedRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockedRegister).toHaveBeenCalledWith({ token: 'ExponentPushToken[xyz]', platform: expect.any(String) });
  });

  it('does not register when permission is denied', async () => {
    (Constants as unknown as { expoConfig: { extra: { eas: { projectId: string } } } }).expoConfig = {
      extra: { eas: { projectId: 'proj-1' } },
    };
    mockedGetPermissions.mockResolvedValue({ status: 'denied' });
    mockedRequestPermissions.mockResolvedValue({ status: 'denied' });

    await registerForPushNotifications();

    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('never throws when the registration call itself fails', async () => {
    (Constants as unknown as { expoConfig: { extra: { eas: { projectId: string } } } }).expoConfig = {
      extra: { eas: { projectId: 'proj-1' } },
    };
    mockedGetPermissions.mockResolvedValue({ status: 'granted' });
    mockedGetToken.mockResolvedValue({ data: 'tok' });
    mockedRegister.mockRejectedValue(new Error('network down'));

    await expect(registerForPushNotifications()).resolves.toBeUndefined();
  });
});

describe('unregisterCurrentPushToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Constants as unknown as { expoConfig: { extra: { eas: { projectId: string } } } }).expoConfig = {
      extra: { eas: { projectId: 'proj-1' } },
    };
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('unregisters the current token', async () => {
    mockedGetToken.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    await unregisterCurrentPushToken();
    expect(mockedUnregister).toHaveBeenCalledWith({ token: 'ExponentPushToken[abc]' });
  });

  it('never throws when unregistering fails', async () => {
    mockedGetToken.mockRejectedValue(new Error('no token'));
    await expect(unregisterCurrentPushToken()).resolves.toBeUndefined();
  });

  it('does nothing without a project id', async () => {
    (Constants as unknown as { expoConfig: { extra: Record<string, unknown> } }).expoConfig = { extra: {} };
    await unregisterCurrentPushToken();
    expect(mockedGetToken).not.toHaveBeenCalled();
  });

  it('resolves within the timeout instead of hanging the caller when the network call never settles', async () => {
    jest.useFakeTimers();
    mockedGetToken.mockReturnValue(new Promise(() => {})); // never resolves
    let resolved = false;
    const promise = unregisterCurrentPushToken().then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    jest.advanceTimersByTime(3_000);
    await promise;
    expect(resolved).toBe(true);
    expect(mockedUnregister).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
