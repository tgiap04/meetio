/**
 * Hồi quy cho một lỗi đã xảy ra thật trên máy: bundle JS chạy trên một binary native
 * chưa có `RNGoogleSignin`.
 *
 * Thư viện gọi `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` ở phạm vi module
 * của nó. Khi module đó vắng mặt, một `import` tĩnh ở đầu `google-native-signin.ts`
 * sẽ ném NGAY LÚC NẠP, kéo sập cả đồ thị module của màn hình import nó. Triệu chứng
 * người dùng thấy không hề nhắc tới Google:
 *
 *     ERROR [Invariant Violation: TurboModuleRegistry.getEnforcing(...):
 *            'RNGoogleSignin' could not be found...]
 *     WARN  Route "./(auth)/login.tsx" is missing the required default export.
 *
 * Nghĩa là mất luôn cả đăng nhập email/mật khẩu, dù phần đó chẳng liên quan gì tới
 * Google. Ba tình huống bình thường dẫn tới đây: binary dựng trước khi thêm thư viện,
 * `git pull` mà quên `make build-app`, và EAS Update đẩy JS mới xuống binary cũ —
 * tình huống cuối xảy ra trên máy người dùng thật, không phải chỉ lúc phát triển.
 *
 * File này tách khỏi `google-native-signin.test.ts` vì nó cần package NÉM khi require,
 * ngược hẳn với mock đường-thành-công mà file kia dựng ở phạm vi module.
 */
const TURBO_MODULE_ERROR =
  "Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'RNGoogleSignin' could not be found.";

/**
 * `import()` động thất bại dưới runtime Jest CJS này ("A dynamic import callback was
 * invoked without --experimental-vm-modules") — đã đo trực tiếp. Dùng `require()` đồng
 * bộ trong `jest.isolateModules`, giống hệt helper ở `google-native-signin.test.ts`.
 */
function loadModule(): typeof import('./google-native-signin') {
  let mod: typeof import('./google-native-signin') | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- xem ghi chú ở trên
    mod = require('./google-native-signin');
  });
  return mod!;
}

describe('khi binary native thiếu RNGoogleSignin', () => {
  const previous = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  beforeEach(() => {
    jest.resetModules();
    // Phải vượt qua được chốt NOT_CONFIGURED thì mới chạm tới đường nạp thư viện.
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client-id.apps.googleusercontent.com';
    jest.doMock('@react-native-google-signin/google-signin', () => {
      throw new Error(TURBO_MODULE_ERROR);
    });
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    } else {
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = previous;
    }
    jest.dontMock('@react-native-google-signin/google-signin');
  });

  it('nạp được module bọc mà không ném — đây mới là thứ giữ cho màn login sống', () => {
    // Khẳng định chính của cả file. Nếu `import` quay về dạng tĩnh, dòng này ném và
    // `login.tsx` mất default export, đúng như lỗi đã gặp.
    expect(() => loadModule()).not.toThrow();
  });

  it('trả error/NATIVE_MODULE_MISSING thay vì làm sập app', async () => {
    const { signInWithGoogleNative } = loadModule();

    await expect(signInWithGoogleNative()).resolves.toEqual({
      status: 'error',
      code: 'NATIVE_MODULE_MISSING',
    });
  });

  it('chỉ thử nạp thư viện một lần, không thử lại mỗi lần bấm', async () => {
    const factory = jest.fn(() => {
      throw new Error(TURBO_MODULE_ERROR);
    });
    jest.doMock('@react-native-google-signin/google-signin', factory);

    const { signInWithGoogleNative } = loadModule();
    await signInWithGoogleNative();
    await signInWithGoogleNative();
    await signInWithGoogleNative();

    // `sdk` nhớ cả trạng thái null, nên require chỉ chạy một lần. Không có chốt này
    // thì mỗi lần bấm lại ném và nuốt một exception nữa.
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('vẫn ưu tiên NOT_CONFIGURED khi chưa điền client ID', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const { signInWithGoogleNative } = loadModule();

    // Chưa cấu hình thì còn chẳng cần biết binary có module hay không — câu trả lời
    // hữu ích hơn là "bạn chưa điền client ID".
    await expect(signInWithGoogleNative()).resolves.toEqual({
      status: 'error',
      code: 'NOT_CONFIGURED',
    });
  });
});
