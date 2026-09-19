# Sở hữu file

Đường dẫn tương đối với **gốc repo**. **Mỗi file đúng một phase sở hữu.** Phase khác được `import`
nhưng **không được sửa**. Đây là điều kiện để `00∥01∥02∥04∥05∥08`, `03∥06∥07∥09` và `10∥12` chạy
song song mà không giẫm lên nhau.

Kiểm nhanh: không có đường dẫn nào xuất hiện hai lần trong hai bảng đầu.

---

## Tạo mới

| File | Phase | Ghi chú |
|---|---|---|
| `apps/mobile/scripts/check-public-env.cjs` | 00 | phép kiểm đường env; tự pin production, tự xoá khoá |
| `apps/api/src/database/migrations/1758000000010-AddGoogleIdentityToUsers.ts` | 02 | nối tiếp `...009` |
| `apps/api/src/auth/google-identity.ts` + `.spec.ts` | 03 | hàm thuần: kiểm & chuẩn hóa claim |
| `apps/api/src/auth/google-token-verifier.ts` + `.spec.ts` | 03 | bọc `OAuth2Client.verifyIdToken` |
| `apps/api/src/auth/google-auth.service.ts` + `.spec.ts` | 03 | ba nhánh tra cứu + liên kết |
| `apps/api/src/auth/dto/google-sign-in.dto.ts` | 03 | `implements GoogleSignInRequest` |
| `apps/api/src/auth/auth.controller.spec.ts` | 03 | khẳng định throttle kế thừa |
| `apps/mobile/src/components/primary-button.test.tsx` | 04 | chưa từng có test |
| `apps/mobile/src/components/auth/auth-screen-shell.tsx` | 05 | nền + wordmark + tránh bàn phím |
| `apps/mobile/src/components/auth/google-sign-in-button.tsx` | 05 | thuần trình bày |
| `apps/mobile/src/components/auth/auth-divider.tsx` | 05 | gạch ngang "hoặc" |
| `apps/mobile/src/components/auth/auth-chrome.test.tsx` | 05 | một file test gộp cho ba component trên |
| `apps/mobile/assets/google-g.png` (+`@2x`, `@3x`) | 05 | dấu G chính chủ, tải từ trang branding của Google |
| `apps/mobile/src/components/auth/login-form.tsx` + `.test.tsx` | 06 | |
| `apps/mobile/src/components/auth/register-form.tsx` + `.test.tsx` | 07 | |
| `apps/mobile/app.config.ts` | 08 | thay `app.json`, plugin có điều kiện theo env |
| `apps/mobile/src/auth/google-native-signin.ts` + `.test.ts` | 08 | bọc `GoogleSignin`, chuẩn hóa kết quả |
| `apps/mobile/src/hooks/use-google-sign-in.ts` + `.test.tsx` | 09 | |
| `apps/mobile/src/navigation/login-screen.test.tsx` | 10 | test cấp route (**không** đặt dưới `app/`) |
| `apps/mobile/src/navigation/register-screen.test.tsx` | 10 | |

## Sửa file đã có

| File | Phase | Sửa gì |
|---|---|---|
| `packages/shared/src/auth/auth.types.ts` | 01 | `+ GoogleSignInRequest` |
| `packages/shared/src/enums/api-error-code.ts` | 01 | `+ GOOGLE_TOKEN_INVALID`, `+ GOOGLE_EMAIL_UNVERIFIED` |
| `apps/mobile/src/api/error-messages.ts` | 01 | hai câu tiếng Việt — **không thêm là lỗi biên dịch** |
| `apps/mobile/src/api/error-messages.test.ts` | 01 | ca cho hai mã mới |
| `docs/api-spec.md` | 01 | §1 thêm dòng route · §9 thêm hai dòng mã lỗi |
| `apps/api/src/database/entities/user.entity.ts` | 02 | `password_hash` nullable · `+ google_sub` |
| `apps/api/src/auth/auth.service.ts` | 02 | chốt null + đối xứng thời gian · `issueTokenPairWithUser` thành `public` |
| `apps/api/src/auth/auth.service.spec.ts` | 02 | ca chỉ-Google, ba tình huống đồng nhất, tỉ lệ thời gian |
| `apps/api/src/users/users.service.ts` | 02 | `deleteMe`: null ⇒ lỗi nói rõ, không phải "sai mật khẩu" |
| `apps/api/src/users/users.service.spec.ts` | 02 | ca chỉ-Google |
| `apps/api/src/database/__tests__/schema.integration.spec.ts` | 02 | ca `down()` từ chối khi còn hàng chỉ-Google |
| `docs/data-model.md` | 02 | bảng `users`: `password_hash` nullable, `+ google_sub`, `CHECK` |
| `apps/api/src/auth/auth.controller.ts` | 03 | `+ @Public() @Post('google')` |
| `apps/api/src/auth/auth.module.ts` | 03 | đăng ký 2 provider mới |
| `apps/api/package.json` | 03 | `+ google-auth-library@^10.9.1` |
| `apps/api/src/main.ts` | 03 | một dòng log khởi động bật/tắt Google (decisions §7) |
| `apps/mobile/src/components/primary-button.tsx` | 04 | `backgroundColor` → `BrandFill` |
| `apps/mobile/package.json` | 08 | `+ @react-native-google-signin/google-signin@^16.1.5` |
| `apps/mobile/jest.setup.ts` | 08 | **chỉ khi** bước đo ở phase 08 kết luận là cần |
| `.env.example` | 08 | 1 khóa server + 3 khóa `EXPO_PUBLIC_GOOGLE_*` (ghi cả hai cụm một lần) |
| `apps/mobile/src/api/auth.ts` | 09 | `+ signInWithGoogle()` |
| `apps/mobile/app/(auth)/login.tsx` | 10 | rút mỏng còn hook + điều hướng |
| `apps/mobile/app/(auth)/register.tsx` | 10 | như trên |
| `README.md` | 00, rồi 11 | 00: Setup + "Without make" + cảnh báo bí mật · 11: mục "Google Sign-In setup" |
| `Makefile` | 00, rồi 11 | 00: `env` sinh `apps/mobile/.env` · 11: `app-verify` kiểm Info.plist + `env` thêm khoá Google |

## Xóa

| File | Phase | Vì sao |
|---|---|---|
| `apps/mobile/app.json` | 08 | thay bằng `app.config.ts` — **xóa**, không để cả hai (Expo sẽ merge và gây nhầm) |

## File sinh tự động / mở lại theo thứ tự

| File | Phase | Quy tắc |
|---|---|---|
| `yarn.lock` | 08, rồi 03 | Do `yarn install` sinh. Hai phase **không bao giờ cùng đợt** (08 đợt 1, 03 đợt 2) nên không đua. Không sửa tay. |
| `Makefile` · `README.md` | 00 (đợt 1), rồi 11 (đợt cuối) | Cách nhau ba đợt, **không bao giờ song song**. 11 **mở rộng** danh sách cho phép mà 00 dựng, không viết lại nó. |
| `apps/mobile/.env` | — | **Không ai sở hữu**: đầu ra do `make env` sinh, bị `.gitignore` chặn (`git check-ignore -v` → `.gitignore:12`). Không commit, không sửa tay. |
| `apps/api/src/users/users.service.ts` | 02, rồi **12** | 12 nằm ở đợt 3, sau 02 ba đợt. Cắt 12 thì bản của 02 là bản cuối. |
| `packages/shared/src/users/users.types.ts` · `apps/api/src/users/dto/delete-me.dto.ts` · `docs/api-spec.md` §2 | **12** | Chỉ phase 12 chạm. `docs/api-spec.md` phase 01 sửa §1/§9; phase 12 sửa §2 — khác mục, khác đợt. |

## Không được đụng (kiểm tra ngược)

| File | Vì sao |
|---|---|
| `apps/mobile/src/hooks/use-auth-mutations.ts` | `persistSession` dùng lại **nguyên xi**. Endpoint Google trả đúng `AuthTokenPair` để **không** phải đẻ đường lưu token thứ hai |
| `apps/mobile/src/store/session.store.ts` · `src/storage/secure-store.ts` | Phiên Google là phiên y hệt phiên mật khẩu |
| `apps/mobile/src/api/axios-client.ts` · `refresh-single-flight.ts` | Xoay vòng refresh không biết và không cần biết phiên bắt đầu bằng gì |
| `apps/api/src/auth/jwt.strategy.ts` · `jwt-auth.guard.ts` · `auth.constants.ts` | Access token phát ra giống hệt; TTL là hợp đồng với api-spec §1 |
| `apps/api/src/common/filters/api-exception.filter.ts` | Mã mới **ném tường minh** từ tầng nghiệp vụ; bộ lọc vẫn không được đoán mã từ HTTP status (api-spec §9) |
| `apps/api/src/database/migrations/1758000000001..009` | Migration đã chạy là bất biến. Thay đổi schema đi bằng `...010` |
| `apps/mobile/src/theme/colors.ts` · `typography.ts` (+ test) | Bảng màu và token chữ đã đủ cho hai màn auth. Thêm token là nợ không ai render |
| `apps/mobile/src/components/illustrations/*` | `ScreenBackdrop`, `AppMark`, `BrandFill` dùng lại, không sửa |
| `apps/mobile/src/navigation/route-guards.ts` · `bootstrap-route.ts` | Đăng nhập Google kết thúc bằng đúng `router.replace('/')` như login mật khẩu — không cổng mới |
| `apps/mobile/app/(auth)/_layout.tsx` | Guard của `(auth)` đúng như cũ |
| `apps/mobile/ios/` · `apps/mobile/android/` | CNG sinh ra, **đã trong `.gitignore`**. Không commit, không sửa tay |
| `.github/workflows/ci.yml` | Không phase nào cần cổng CI mới. Cần thì phải nói ra, không lặng lẽ thêm |

## Điểm chạm giữa các phase (hợp đồng import — **chốt trước khi đợt 1 khởi công**)

| Phase tiêu thụ | Import từ | Ký hiệu |
|---|---|---|
| 03 | 01 | `GoogleSignInRequest`, `ApiErrorCode.GOOGLE_TOKEN_INVALID`, `ApiErrorCode.GOOGLE_EMAIL_UNVERIFIED` |
| 03 | 02 | `AuthService.issueTokenPairWithUser(user): Promise<AuthTokenPair>` (**public**) · `User.google_sub: string \| null` · `User.password_hash: string \| null` |
| 06, 07 | 04 | `PrimaryButton` (props **không đổi**) |
| 06, 07 | 05 | `AuthScreenShell`, `GoogleSignInButton`, `AuthDivider` |
| 09 | 01 | `GoogleSignInRequest` |
| 09 | 08 | `signInWithGoogleNative(): Promise<GoogleNativeResult>` |
| 10 | 06, 07 | `LoginForm`, `RegisterForm` |
| 10 | 09 | `useGoogleSignIn()` |
| 08 | 00 | đường nạp env: `apps/mobile/.env` là nơi `EXPO_PUBLIC_*` thật sự tới bundler (mềm — 08 khởi công song song được, xem [phase-08](phase-08-google-signin-library-and-native-wrapper.md) §AC #3) |
| 11 | 00 | danh sách cho phép trong target `env` · script `check-env` |
| 11 | 08 | tên biến env `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` (dùng trong `app-verify`) |
| 12 | 03 | `GoogleTokenVerifier.verify(idToken): Promise<GoogleIdentityClaims>` |

**Chữ ký đầy đủ nằm trong từng phase file sở hữu nó.** Phase tiêu thụ **không được tự đổi chữ ký** —
cần đổi thì báo lại, không sửa file của phase khác.
