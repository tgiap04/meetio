# Sở hữu file

Mọi đường dẫn tương đối với `apps/mobile/`. **Mỗi file đúng một phase sở hữu.** Phase khác được
`import` nhưng **không được sửa**. Đây là điều kiện để 01∥02∥03, 04∥05 và 06∥07 chạy song song mà
không giẫm lên nhau.

## Tạo mới

| File | Phase | Ghi chú |
|---|---|---|
| `src/components/illustrations/arc.tsx` | 01 | nguyên thể cung tròn |
| `src/components/illustrations/blob.tsx` | 01 | mảng peach hữu cơ nền splash |
| `src/components/illustrations/app-mark.tsx` | 01 | ô icon + 5 vạch sóng |
| `src/components/illustrations/mic-glyph.tsx` | 01 | biểu tượng mic trắng |
| `src/components/illustrations/onboarding-art.tsx` | 01 | điện thoại + nút mic + thẻ nổi (màn 2) |
| `src/components/illustrations/mic-permission-art.tsx` | 01 | vòng đồng tâm + sóng + thẻ tick (màn 3) |
| `src/components/illustrations/*.test.tsx` | 01 | một file test gộp: `illustrations.test.tsx` |
| `src/components/pager-dots.tsx` + `.test.tsx` | 01 | dùng lại ở splash **và** onboarding |
| `src/components/branded-paragraph.tsx` + `.test.tsx` | 01 | in đậm "Meetio" giữa đoạn |
| `src/storage/device-preferences.ts` + `.test.ts` | 02 | |
| `src/store/preferences.store.ts` + `.test.ts` | 02 | |
| `src/hooks/use-hydrate-preferences.ts` + `.test.ts` | 02 | |
| `src/permissions/microphone-permission.ts` + `.test.ts` | 03 | bọc `expo-audio` + hàm thuần |
| `src/components/splash/app-splash.tsx` + `.test.tsx` | 04 | |
| `src/hooks/use-minimum-splash-delay.ts` + `.test.ts` | 04 | |
| `src/navigation/root-layout-boot-gate.test.tsx` | 04 | |
| `src/navigation/bootstrap-route.ts` + `.test.ts` | 05 | |
| `src/navigation/app-index-redirect.test.tsx` | 05 | |
| `src/navigation/auth-group-layout.test.tsx` | 05 | |
| `app/onboarding.tsx` | 06 | |
| `src/content/onboarding-pages.ts` + `.test.ts` | 06 | |
| `src/components/onboarding/onboarding-page.tsx` + `.test.tsx` | 06 | |
| `src/hooks/use-complete-onboarding.ts` | 06 | |
| `src/navigation/onboarding-screen.test.tsx` | 06 | |
| `app/(app)/permission.tsx` | 07 | |
| `src/components/permission/permission-body.tsx` + `.test.tsx` | 07 | |
| `src/hooks/use-microphone-permission.ts` | 07 | |
| `src/navigation/permission-screen.test.tsx` | 07 | |

## Sửa file đã có

| File | Phase | Sửa gì |
|---|---|---|
| `src/theme/typography.ts` | 01 | thêm token `display` + `heading` |
| `src/theme/typography.test.ts` | 01 | thêm case cho token mới |
| `app/_layout.tsx` | 04 | `<LoadingState>` → `<AppSplash>`, cổng 3 điều kiện |
| `src/navigation/route-guards.ts` | 05 | thêm hằng `ROOT_ROUTE`, `ONBOARDING_ROUTE`, `MIC_PERMISSION_ROUTE` |
| `app/index.tsx` | 05 | gọi `resolveBootstrapRoute` thay vì redirect cứng |
| `app/(auth)/_layout.tsx` | 05 | đích redirect `/(app)` → `'/'` |
| `app.json` | 03 | plugin `expo-audio` + chuỗi `microphonePermission` |
| `apps/mobile/package.json` | 03 | thêm `expo-audio@~57.0.5` |
| `yarn.lock` | 03 | sinh ra bởi `yarn install` |

## Không được đụng (kiểm tra ngược)

| File | Vì sao |
|---|---|
| `src/theme/colors.ts` · `colors.test.ts` | Bảng màu đã đủ cho ba màn này. Thêm token là nợ không ai render |
| `src/store/session.store.ts` · `src/storage/secure-store.ts` | Cờ thiết bị đi đường riêng, không trộn vào session |
| `src/hooks/use-hydrate-session.ts` | `useHydratePreferences` là bản song song, không sửa bản cũ |
| `jest.setup.ts` | mock `expo-secure-store` đã có; `jest-expo` **tự mock** `ExpoAudio` (đã xác minh trong `jest-expo/src/preset/moduleMocks/expoModules.js`) |
| `app/(app)/_layout.tsx` · `src/navigation/route-guards.test.ts` · `app-group-layout.test.tsx` | Guard của `(app)` đúng như cũ, không phase nào cần sửa |
| `app/(app)/index.tsx` · `app/(auth)/login.tsx` | Nợ `colors.primary` ở link chữ — **ngoài phạm vi** (decisions §8) |
| `apps/mobile/ios/` · `apps/mobile/android/` | Sinh tự động, **đã nằm trong `.gitignore`** (`git ls-files` = 0 file). Không commit, không sửa tay |

## Điểm chạm giữa các phase (hợp đồng import)

| Phase tiêu thụ | Import từ | Ký hiệu |
|---|---|---|
| 04 | 01 | `AppMark`, `PagerDots`, `typography.display` |
| 04 | 02 | `usePreferencesStore` (`status`) |
| 05 | 02 | `usePreferencesStore` (`onboardingCompleted`, `micPromptSeen`) |
| 06 | 01 | `PagerDots`, `BrandedParagraph`, `OnboardingArt`, `typography.heading` |
| 06 | 02 | `usePreferencesStore.markOnboardingCompleted` |
| 06 | 05 | `ROOT_ROUTE` |
| 07 | 01 | `MicPermissionArt`, `BrandedParagraph`, `typography.heading` |
| 07 | 02 | `usePreferencesStore.markMicPromptSeen` |
| 07 | 03 | `requestMicrophonePermission`, `readMicrophonePermission`, `resolveMicPermissionView`, `openAppSettings` |
| 07 | 05 | `ROOT_ROUTE` |

Hợp đồng này là thứ **phải chốt trước** khi 01/02/03 khởi công — chữ ký hàm nằm trong từng phase
file tương ứng. Phase tiêu thụ không được tự đổi chữ ký; cần đổi thì báo lại chứ không sửa file của
phase khác.
