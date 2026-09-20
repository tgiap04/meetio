// Chỉ import KIỂU ở tầng module — `import type` bị xóa hoàn toàn khi biên dịch,
// nên dòng này không hề nạp thư viện lúc chạy. Xem `loadSdk()` bên dưới.
import type * as GoogleSdk from '@react-native-google-signin/google-signin';

/**
 * Lớp bọc duy nhất quanh `@react-native-google-signin/google-signin`.
 *
 * Phần còn lại của app chỉ thấy union năm nhánh này — không `null`, không ngoại lệ
 * ném ra — nên một lần nâng major của thư viện về sau chỉ sửa một file. Không màn hình
 * nào được import trực tiếp thư viện gốc.
 */
export type GoogleNativeResult =
  | { status: 'success'; idToken: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' } // thiếu Google Play Services (Android)
  | { status: 'error'; code?: string };

type Sdk = typeof GoogleSdk;

/** `undefined` = chưa thử nạp · `null` = đã thử và không có trong binary. */
let sdk: Sdk | null | undefined;

/**
 * Nạp thư viện NGAY LÚC DÙNG, không phải lúc nạp module.
 *
 * Thư viện gọi `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` ở phạm vi module
 * của nó, nên một `import` ở đầu file sẽ NÉM ngay khi binary native chưa có module —
 * kéo sập cả đồ thị module của màn hình import nó. Triệu chứng là expo-router báo
 * "Route ./(auth)/login.tsx is missing the required default export", không nhắc gì
 * tới Google, nên rất khó lần ra.
 *
 * Chuyện này xảy ra thật, ở ba tình huống bình thường: binary dựng trước khi thêm thư
 * viện, đồng đội `git pull` mà quên `make build-app`, và EAS Update đẩy JS mới xuống
 * một binary cũ — tình huống cuối xảy ra trên máy người dùng thật.
 *
 * Nạp trễ biến sự cố đó từ "màn đăng nhập chết, không đăng nhập được bằng cách nào"
 * thành "nút Google báo lỗi, email/mật khẩu vẫn dùng bình thường".
 */
function loadSdk(): Sdk | null {
  if (sdk !== undefined) return sdk;

  let loaded: unknown;
  try {
    // Bắt buộc là `require`: một `import` tĩnh sẽ chạy lúc nạp module — đúng thứ
    // hàm này sinh ra để tránh.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('@react-native-google-signin/google-signin');
  } catch {
    loaded = undefined;
  }

  // KHÔNG dựa vào `catch` ở trên. Metro bọc lần nạp đầu của mỗi module trong
  // `guardedLoadModule` (metro-runtime/src/polyfills/require.js): factory ném thì
  // nó BẮT, gọi `ErrorUtils.reportFatalError(e)`, rồi trả `undefined` — không ném
  // lại. Nên lần gọi đầu tiên `catch` không hề chạy; chỉ từ lần thứ hai, khi
  // `module.hasError` đã bật, require mới thật sự ném.
  //
  // Vì vậy phải kiểm HÌNH DẠNG thứ nhận được thay vì tin rằng thất bại sẽ ném.
  sdk = isUsable(loaded) ? loaded : null;
  return sdk;
}

/** Đủ dùng nghĩa là gọi được `signIn` — không chỉ là "khác undefined". */
function isUsable(mod: unknown): mod is Sdk {
  if (typeof mod !== 'object' || mod === null) return false;
  const candidate = mod as Partial<Sdk>;
  return typeof candidate.GoogleSignin?.signIn === 'function';
}

let hasConfigured = false;

function configureOnce(lib: Sdk): void {
  if (hasConfigured) return;
  lib.GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  hasConfigured = true;
}

/**
 * Gọi `hasPlayServices()` rồi `signIn()` và chuẩn hóa kết quả về `GoogleNativeResult`.
 *
 * Thiếu `webClientId` không ném lỗi — trả `NOT_CONFIGURED` — vì một biến env trống
 * không được phép làm app crash; nó phải là một lỗi có tên, xử lý được ở lớp trên.
 * Thiếu module native cũng vậy: `NATIVE_MODULE_MISSING`.
 */
export async function signInWithGoogleNative(): Promise<GoogleNativeResult> {
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    return { status: 'error', code: 'NOT_CONFIGURED' };
  }

  const lib = loadSdk();
  if (!lib) {
    // Binary native không có RNGoogleSignin. Cách sửa là dựng lại native
    // (`make build-app` rồi `make app-ios` / `make app-android`), không phải sửa JS.
    return { status: 'error', code: 'NATIVE_MODULE_MISSING' };
  }

  configureOnce(lib);

  try {
    await lib.GoogleSignin.hasPlayServices();
    const response = await lib.GoogleSignin.signIn();

    if (!lib.isSuccessResponse(response)) {
      return { status: 'cancelled' };
    }

    // API v16 lồng trong `data` — KHÔNG đọc `response.idToken` (hình dạng cũ, đã lỗi thời).
    const idToken = response.data.idToken;
    if (!idToken) {
      return { status: 'error', code: 'NO_ID_TOKEN' };
    }

    return { status: 'success', idToken };
  } catch (error) {
    if (lib.isErrorWithCode(error)) {
      if (error.code === lib.statusCodes.SIGN_IN_CANCELLED) {
        return { status: 'cancelled' };
      }
      if (error.code === lib.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { status: 'unavailable' };
      }
      return { status: 'error', code: error.code };
    }
    return { status: 'error' };
  }
}
