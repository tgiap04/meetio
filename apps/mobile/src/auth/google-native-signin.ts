import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

/**
 * Lớp bọc duy nhất quanh `@react-native-google-signin/google-signin`.
 *
 * Phần còn lại của app chỉ thấy union bốn nhánh này — không `null`, không ngoại lệ
 * ném ra — nên một lần nâng major của thư viện về sau chỉ sửa một file. Không màn hình
 * nào được import trực tiếp thư viện gốc.
 */
export type GoogleNativeResult =
  | { status: 'success'; idToken: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' } // thiếu Google Play Services (Android)
  | { status: 'error'; code?: string };

let hasConfigured = false;

function configureOnce(): void {
  if (hasConfigured) return;
  GoogleSignin.configure({
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
 */
export async function signInWithGoogleNative(): Promise<GoogleNativeResult> {
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    return { status: 'error', code: 'NOT_CONFIGURED' };
  }

  configureOnce();

  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) {
      return { status: 'cancelled' };
    }

    // API v16 lồng trong `data` — KHÔNG đọc `response.idToken` (hình dạng cũ, đã lỗi thời).
    const idToken = response.data.idToken;
    if (!idToken) {
      return { status: 'error', code: 'NO_ID_TOKEN' };
    }

    return { status: 'success', idToken };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return { status: 'cancelled' };
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { status: 'unavailable' };
      }
      return { status: 'error', code: error.code };
    }
    return { status: 'error' };
  }
}
