---
phase: 09
title: "useGoogleSignIn + api/auth.ts"
status: completed
priority: P1
effort: 1.5h
blockedBy: [01, 08]
blocks: [10]
---

# Phase 09 — `useGoogleSignIn` + `api/auth.ts`

**Liên kết:** [plan.md](plan.md) · [decisions §10](decisions.md) · [file-ownership.md](file-ownership.md) ·
[phase-08 (lớp bọc native)](phase-08-google-signin-library-and-native-wrapper.md) ·
[phase-01 (hợp đồng)](phase-01-shared-contract-and-error-codes.md)

## Tổng quan

Nối `signInWithGoogleNative()` (phase 08) với `POST /auth/google` (phase 03) và với
`persistSession` **đã có sẵn**. Một hook, một hàm API, không có gì khác.

Phase này là chỗ nguyên tắc "không đẻ đường lưu token thứ hai" được thực thi bằng code.

## Nhận định then chốt

- **`persistSession` dùng lại nguyên xi, không sửa một dòng.** Nó nằm trong
  `use-auth-mutations.ts` — file nằm trong danh sách **cấm đụng** của
  [file-ownership](file-ownership.md). Endpoint Google trả đúng `AuthTokenPair` chính là để điều này
  khả thi. Nếu hoá ra phải sửa nó, nghĩa là hợp đồng ở phase 01 đã sai — **dừng lại và báo**, đừng
  chữa ở đây.
- **Hai nhánh hỏng khác hẳn nhau về chất:**

  | Nhánh | Từ đâu | Người dùng nên thấy |
  |---|---|---|
  | native | hộp thoại Google | `cancelled` ⇒ **im lặng tuyệt đối**; `unavailable`/`error` ⇒ một câu |
  | mạng | `POST /auth/google` | câu từ `getErrorMessage(err)` |

  `cancelled` mà hiện lỗi là bắt lỗi người dùng vì đã đổi ý. Đây là ca dễ làm sai nhất trong phase.
- **Zustand không giữ dữ liệu server.** Hook trả `isPending`/`errorMessage` là state **cục bộ của
  React**, không phải store. Token đi qua `persistSession` như mọi đường khác.
- **TanStack Query hay `useState` trần?** `useMutation` cho thống nhất với `useLoginMutation` /
  `useRegisterMutation`, và để `onSuccess: persistSession` là **đúng một dòng** — cùng khuôn, cùng
  chỗ đọc.

## Yêu cầu

**Chức năng**

1. `src/api/auth.ts` thêm:
   ```ts
   export async function signInWithGoogle(body: GoogleSignInRequest): Promise<AuthTokenPair> {
     const { data } = await apiClient.post<AuthTokenPair>('/auth/google', body);
     return data;
   }
   ```
   Kiểu lấy từ `@meetio/shared`; **không khai lại hình dạng dây** (quy ước sẵn có của file).
2. `src/hooks/use-google-sign-in.ts`:
   ```ts
   export interface GoogleSignInState {
     start: () => void;
     isPending: boolean;
     errorMessage: string | null;
   }
   export function useGoogleSignIn(): GoogleSignInState;
   ```
   `start()` chạy:
   1. `isPending = true`, xoá `errorMessage`;
   2. `signInWithGoogleNative()`;
   3. `cancelled` ⇒ dừng, `isPending = false`, **`errorMessage` giữ null**;
   4. `unavailable` ⇒ câu về Google Play Services; `error` ⇒ câu chung, ghi kèm `code` vào message
      khi `__DEV__` để còn gỡ lỗi được;
   5. `success` ⇒ `mutation.mutate({ id_token })`, `onSuccess: persistSession`;
   6. lỗi mạng ⇒ `errorMessage = getErrorMessage(err)` — bắt được cả
      `GOOGLE_EMAIL_UNVERIFIED` nhờ bảng của phase 01.
   - `start()` gọi khi đang `isPending` ⇒ **bỏ qua**, không xếp hàng.

**Phi chức năng**

- File < 200 dòng (dự kiến ~70).
- **Không** import `@react-native-google-signin/*` — chỉ qua lớp bọc phase 08.
- **Không** import `expo-router`: điều hướng sau đăng nhập là việc của phase 10 và của cổng
  bootstrap sẵn có, không phải của hook.

## Luồng dữ liệu

```
start()
  └─► signInWithGoogleNative()          (08)
         ├─ cancelled   → dừng, KHÔNG có lỗi
         ├─ unavailable → errorMessage
         ├─ error       → errorMessage
         └─ success ──► POST /auth/google { id_token }        (03)
                           ├─ 4xx → errorMessage = getErrorMessage(err)
                           └─ 200 → persistSession(tokens)    ← hàm ĐÃ CÓ, không sửa
                                       ├─ writeTokens()  → secure-store
                                       └─ setTokens()    → session.store (authStatus → authenticated)
```

Nhánh cuối cùng **giống hệt** đăng nhập mật khẩu từ `persistSession` trở đi. Sau đó
`(auth)/_layout.tsx` thấy `authenticated` và đẩy về `'/'`, rồi `app/index.tsx` quyết định đi đâu —
kể cả màn xin quyền micro cho người mới. **Không cổng điều hướng mới nào được thêm.**

## File liên quan

Tạo: `apps/mobile/src/hooks/use-google-sign-in.ts` + `use-google-sign-in.test.tsx`
Sửa: `apps/mobile/src/api/auth.ts`

## Các bước triển khai

1. Thêm `signInWithGoogle` vào `api/auth.ts` (theo đúng văn phong 4 hàm sẵn có).
2. Viết `use-google-sign-in.test.tsx` trước, mock `../auth/google-native-signin` và adapter axios —
   **không** mock `persistSession`: nó phải chạy thật để AC #4 có nghĩa.
3. Viết hook.
4. `yarn workspace @meetio/mobile run test`.

## Todo

- [ ] `signInWithGoogle` trong `api/auth.ts`
- [ ] `useGoogleSignIn`
- [ ] Test: `cancelled` **không** sinh lỗi
- [ ] Test: `success` → token vào secure-store **và** session store
- [ ] Test: `GOOGLE_EMAIL_UNVERIFIED` ra đúng câu hướng dẫn
- [ ] Test: gọi `start()` chồng nhau bị bỏ qua

## Tiêu chí nghiệm thu (quan sát được)

| # | Test / lệnh | Kỳ vọng |
|---|---|---|
| 1 | `yarn typecheck && yarn lint && yarn workspace @meetio/mobile run test` | thoát 0 |
| 2 | `useGoogleSignIn không đặt errorMessage khi người dùng huỷ` | `errorMessage === null` sau `cancelled` |
| 3 | `useGoogleSignIn POST /auth/google đúng { id_token } và không gì khác` | body có **đúng một khoá** |
| 4 | `useGoogleSignIn dùng lại persistSession` — sau khi thành công, `useSessionStore.getState().authStatus === 'authenticated'` **và** secure-store (mock in-memory của `jest.setup.ts`) giữ cả hai token | pass |
| 5 | `useGoogleSignIn hiện câu hướng dẫn xác minh khi máy chủ trả GOOGLE_EMAIL_UNVERIFIED` | khớp chuỗi của phase 01 |
| 6 | `useGoogleSignIn bỏ qua start() thứ hai khi đang chạy` | lớp bọc native được gọi **đúng 1 lần** |
| 7 | `useGoogleSignIn hiện lỗi riêng khi thiếu Google Play Services` | pass |
| 8 | `grep -E "google-signin\|expo-router" src/hooks/use-google-sign-in.ts` | **không kết quả** |
| 9 | `git diff --name-only` | **không chứa** `src/hooks/use-auth-mutations.ts` |
| 10 | `wc -l src/hooks/use-google-sign-in.ts` | `< 200` |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| Hiện lỗi khi người dùng huỷ ⇒ trông như app hỏng | **Cao** × Trung | AC #2. Đây là ca hay sai nhất; `cancelled` là đường đi bình thường, không phải lỗi |
| Chép logic `persistSession` vào hook "cho gọn" ⇒ hai đường lưu token | Trung × **Cao** | AC #4 + AC #9. Hai đường lệch nhau là lỗi phiên không ai tái hiện được |
| `errorMessage` của lần trước dính lại sang lần sau | Trung × Thấp | Xoá ở bước 1 của `start()` |
| Bấm hai lần ⇒ hai luồng native chồng nhau (`statusCodes.IN_PROGRESS`) | Trung × Trung | Chốt `isPending` ở AC #6, cộng với khoá chéo ở tầng UI (phase 06/07) |
| Điều hướng thẳng tới `/(app)` sau khi đăng nhập ⇒ bỏ qua màn quyền micro | Trung × Trung | Hook **không** điều hướng gì cả; cổng bootstrap sẵn có lo — đúng bất biến của kế hoạch trước |

## Bảo mật

- **`id_token` chỉ đi một chặng**: từ lớp bọc → thân request → hết. Không lưu vào store, không vào
  secure-store, **không log** ở bất kỳ nhánh nào (kể cả nhánh lỗi, kể cả dưới `__DEV__`).
- **Thân request đúng một trường.** AC #3 khóa điều này ở phía client, đối xứng với
  `whitelist: true` ở phía máy chủ. Không bao giờ gửi kèm email hay user id "cho tiện" — máy chủ sẽ
  cắt bỏ, nhưng nó tập cho người đọc code một thói quen sai.
- **Thông báo lỗi lấy từ `getErrorMessage`**, tức là từ máy chủ hoặc từ bảng dự phòng. Không tự ghép
  câu từ `err.response.data` thô — đó là cách chuỗi nội bộ lọt lên màn hình.
- Phiên tạo ra ở đây **giống hệt** phiên mật khẩu: cùng secure-store, cùng session store, cùng đường
  refresh với xoay vòng và thu hồi cả họ. Không có mã nào riêng cho "phiên Google".

## Đường lùi

`git revert` một commit. Hai file, không file nào được phase khác import cho tới phase 10, nên lùi
sạch. Cần tắt nhanh mà không revert: để trống `GOOGLE_OAUTH_AUDIENCES` ở máy chủ — hook vẫn chạy
nhưng mọi lần bấm đều ra lỗi có kiểm soát.

## Tiếp theo

Cùng với **06** và **07** mở khóa **10**.
