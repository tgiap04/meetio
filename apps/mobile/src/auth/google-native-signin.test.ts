/**
 * Vì mỗi test cần điều khiển `GoogleSignin.signIn`/`hasPlayServices` theo một nhánh cụ
 * thể (cancelled, lỗi Play Services, lỗi mạng...), file này tự mock package thay vì
 * dùng mock mặc định của thư viện (nạp qua `setupFiles` trong package.json, vốn chỉ mô
 * phỏng đường thành công). `jest.mock` ở đây ghi đè mock đó cho riêng file test này.
 */
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
  },
  isSuccessResponse: jest.fn((response: { type: string }) => response.type === 'success'),
  isErrorWithCode: jest.fn(
    (error: unknown): error is { code: string } =>
      typeof error === 'object' && error !== null && 'code' in error,
  ),
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

const mockConfigure = GoogleSignin.configure as jest.Mock;
const mockHasPlayServices = GoogleSignin.hasPlayServices as jest.Mock;
const mockSignIn = GoogleSignin.signIn as jest.Mock;
const mockIsSuccessResponse = isSuccessResponse as unknown as jest.Mock;
const mockIsErrorWithCode = isErrorWithCode as unknown as jest.Mock;

const ENV_KEYS = ['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'] as const;

/**
 * Nạp lại module dưới test sau mỗi lần đổi env, vì cờ "đã configure" là biến module-level.
 * `import()` động thất bại dưới runtime Jest CJS này ("A dynamic import callback was invoked
 * without --experimental-vm-modules") — đã đo trực tiếp — nên dùng `require()` đồng bộ bên
 * trong `jest.isolateModules`, cách chuẩn của Jest cho đúng nhu cầu này.
 */
function loadModule(): typeof import('./google-native-signin') {
  let mod: typeof import('./google-native-signin') | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- xem ghi chú ở trên
    mod = require('./google-native-signin');
  });
  return mod!;
}

describe('signInWithGoogleNative', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  });

  afterAll(() => {
    for (const key of ENV_KEYS) process.env[key] = originalEnv[key];
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPlayServices.mockResolvedValue(true);
    mockIsSuccessResponse.mockImplementation((response: { type: string }) => response.type === 'success');
    mockIsErrorWithCode.mockImplementation(
      (error: unknown): error is { code: string } =>
        typeof error === 'object' && error !== null && 'code' in error,
    );
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client-id';
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client-id';
  });

  it('trả error/NOT_CONFIGURED khi thiếu webClientId, và không ném', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const { signInWithGoogleNative } = await loadModule();

    await expect(signInWithGoogleNative()).resolves.toEqual({
      status: 'error',
      code: 'NOT_CONFIGURED',
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('đọc idToken từ response.data.idToken (hình dạng v16), không từ response.idToken', async () => {
    mockSignIn.mockResolvedValue({
      type: 'success',
      idToken: 'STALE_FLAT_SHAPE_SHOULD_NOT_BE_READ',
      data: { idToken: 'real-id-token' },
    });
    const { signInWithGoogleNative } = await loadModule();

    await expect(signInWithGoogleNative()).resolves.toEqual({
      status: 'success',
      idToken: 'real-id-token',
    });
    expect(mockConfigure).toHaveBeenCalledWith({
      webClientId: 'web-client-id',
      iosClientId: 'ios-client-id',
    });
  });

  it('trả error/NO_ID_TOKEN khi success nhưng idToken rỗng', async () => {
    mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: null } });
    const { signInWithGoogleNative } = await loadModule();

    await expect(signInWithGoogleNative()).resolves.toEqual({
      status: 'error',
      code: 'NO_ID_TOKEN',
    });
  });

  it('trả cancelled khi người dùng đóng hộp thoại', async () => {
    mockSignIn.mockRejectedValue({ code: statusCodes.SIGN_IN_CANCELLED });
    const { signInWithGoogleNative } = await loadModule();

    await expect(signInWithGoogleNative()).resolves.toEqual({ status: 'cancelled' });
  });

  it('trả unavailable khi PLAY_SERVICES_NOT_AVAILABLE', async () => {
    mockHasPlayServices.mockRejectedValue({ code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE });
    const { signInWithGoogleNative } = await loadModule();

    await expect(signInWithGoogleNative()).resolves.toEqual({ status: 'unavailable' });
  });

  it('trả error kèm code khi lỗi native không rõ danh mục', async () => {
    mockSignIn.mockRejectedValue({ code: 'SOME_OTHER_CODE' });
    const { signInWithGoogleNative } = await loadModule();

    await expect(signInWithGoogleNative()).resolves.toEqual({
      status: 'error',
      code: 'SOME_OTHER_CODE',
    });
  });

  it('trả error không kèm code khi lỗi không phải NativeModuleError', async () => {
    mockSignIn.mockRejectedValue(new Error('network down'));
    const { signInWithGoogleNative } = await loadModule();

    await expect(signInWithGoogleNative()).resolves.toEqual({ status: 'error' });
  });

  it('chỉ gọi configure() một lần dù signIn nhiều lần', async () => {
    mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'tok' } });
    const { signInWithGoogleNative } = await loadModule();

    await signInWithGoogleNative();
    await signInWithGoogleNative();

    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });
});
