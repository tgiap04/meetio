import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { GoogleSignInRequest } from '@meetio/shared';
import { signInWithGoogleNative } from '../auth/google-native-signin';
import { signInWithGoogle } from '../api/auth';
import { getErrorMessage } from '../api/error-messages';
import { persistSession } from './use-auth-mutations';

/**
 * Câu lỗi cho hai nhánh của lớp bọc native (phase 08) — đây KHÔNG phải lỗi từ
 * máy chủ, nên không đi qua `getErrorMessage`/`ApiErrorCode`. Nhánh mạng (POST
 * `/auth/google`) luôn dùng `getErrorMessage(err)`, kể cả `GOOGLE_EMAIL_UNVERIFIED`.
 */
const PLAY_SERVICES_MESSAGE =
  'Thiết bị này chưa cài Google Play Services, không thể đăng nhập bằng Google.';
const NATIVE_ERROR_MESSAGE = 'Đăng nhập Google thất bại, vui lòng thử lại.';

export interface GoogleSignInState {
  start: () => void;
  isPending: boolean;
  errorMessage: string | null;
}

/**
 * Nối `signInWithGoogleNative()` (phase 08) với `POST /auth/google` và với
 * `persistSession` đã có sẵn ở `use-auth-mutations.ts` — không có đường lưu
 * token thứ hai. `cancelled` (người dùng đóng hộp thoại) không phải lỗi: nó
 * dừng lặng lẽ, `errorMessage` giữ `null`.
 */
export function useGoogleSignIn(): GoogleSignInState {
  const pendingRef = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: GoogleSignInRequest) => signInWithGoogle(body),
    onSuccess: persistSession,
  });

  const start = useCallback(() => {
    // Chốt ở ref, không ở state: hai lệnh gọi đồng bộ trong cùng một tick phải
    // thấy cùng một giá trị đã khoá — `setState` chỉ có hiệu lực ở lần render
    // sau, quá trễ để chặn lệnh gọi thứ hai.
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsPending(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const result = await signInWithGoogleNative();

        switch (result.status) {
          case 'cancelled':
            return;
          case 'unavailable':
            setErrorMessage(PLAY_SERVICES_MESSAGE);
            return;
          case 'error': {
            const debugSuffix = __DEV__ && result.code ? ` (${result.code})` : '';
            setErrorMessage(`${NATIVE_ERROR_MESSAGE}${debugSuffix}`);
            return;
          }
          case 'success':
            try {
              await mutation.mutateAsync({ id_token: result.idToken });
            } catch (err) {
              setErrorMessage(getErrorMessage(err));
            }
            return;
        }
      } finally {
        pendingRef.current = false;
        setIsPending(false);
      }
    })();
  }, [mutation]);

  return { start, isPending, errorMessage };
}
