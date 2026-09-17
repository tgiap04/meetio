---
phase: 05
title: "Bộ định tuyến khởi động"
status: completed
priority: P1
effort: 1.5h
blockedBy: [02]
blocks: [06, 07, 08]
completed: 2026-09-18
---

# Phase 05 — Bộ định tuyến khởi động

**Liên kết:** [plan.md](plan.md) · **[decisions §2 (một bộ quyết định duy nhất)](decisions.md)** ·
[file-ownership.md](file-ownership.md) · mẫu sẵn có: `src/navigation/route-guards.ts`,
`src/navigation/app-group-layout.test.tsx`

## Tổng quan

Một hàm thuần quyết định người dùng rơi vào đâu, và **một** chỗ duy nhất gọi nó. Kèm theo là bản sửa
bắt buộc ở `(auth)/_layout.tsx` — nếu bỏ qua, người vừa đăng nhập xong sẽ **nhảy qua màn quyền micro**.

## Nhận định then chốt

- `app/index.tsx` hiện redirect **cứng** về `APP_HOME_ROUTE`, với comment nói rõ "`(app)` group layout
  là nơi duy nhất quyết định". Kế hoạch này **dời** điểm quyết định lên `index.tsx` và mở rộng nó.
  Guard của `(app)` giữ nguyên vai trò cũ (chặn khi chưa auth) — hai thứ chồng lên nhau an toàn.
- **Lỗi sẽ xảy ra nếu không sửa `(auth)/_layout.tsx`:** đăng nhập thành công → `authStatus` lật sang
  `'authenticated'` → guard `(auth)` bắn `<Redirect href="/(app)" />` ngay → `app/index.tsx` **không
  bao giờ chạy lại** → màn quyền micro bị bỏ qua vĩnh viễn. Đổi đích sang `'/'` là bản vá, và nó
  đúng với bất biến ở [decisions §2](decisions.md).
- Hàm thuần phải xử lý cả `authStatus === 'hydrating'` dù thực tế cổng phase 04 đã chặn — phòng thủ,
  và có test khoá.
- `app/index.tsx` chỉ có `<Redirect>`, **không** `router.replace` trong effect: redirect lúc render
  không để lại history, nên back-gesture không quay ngược về được.

## Yêu cầu

**Chức năng**

1. `src/navigation/route-guards.ts` thêm hằng:
   ```ts
   export const ROOT_ROUTE = '/';
   export const ONBOARDING_ROUTE = '/onboarding';
   export const MIC_PERMISSION_ROUTE = '/(app)/permission';
   ```
   `LOGIN_ROUTE`, `APP_HOME_ROUTE`, hai hàm `shouldRedirectFrom*` **giữ nguyên** — đang có test và
   chỗ dùng.
2. `src/navigation/bootstrap-route.ts`:
   ```ts
   export interface BootstrapState {
     authStatus: AuthStatus;
     onboardingCompleted: boolean;
     micPromptSeen: boolean;
   }
   export function resolveBootstrapRoute(state: BootstrapState): string;
   ```
   Thứ tự xét — **không đổi**: onboarding → auth → quyền → home.
3. `app/index.tsx` đọc hai store, gọi `resolveBootstrapRoute`, render `<Redirect>`.
4. `app/(auth)/_layout.tsx` đổi đích redirect từ `APP_HOME_ROUTE` sang `ROOT_ROUTE`.

**Phi chức năng**

- `bootstrap-route.ts` chỉ import `type` (không import runtime) ⇒ test trần, không mock.
- `app/index.tsx` giữ dưới 25 dòng.

## Kiến trúc

```
                      cổng phase 04 đã mở
                              │
                      app/index.tsx  ◄─────────────┐
                              │                     │ router.replace('/')
              resolveBootstrapRoute()               │ từ MỌI lối "xong"
                              │                     │
   ┌────────────┬─────────────┼────────────┬────────┴──────────────┐
   │            │             │            │                       │
!onboarding  chưa auth    chưa hỏi mic    còn lại          (auth)/_layout khi đã auth
   │            │             │            │
/onboarding  /(auth)/login  /(app)/permission  /(app)
```

**Bảng quyết định đầy đủ** (8 tổ hợp — chính là ma trận test):

| # | authStatus | onboardingCompleted | micPromptSeen | → |
|---|---|---|---|---|
| 1 | hydrating | false | false | `/onboarding` |
| 2 | unauthenticated | false | false | `/onboarding` |
| 3 | authenticated | false | false | `/onboarding` |
| 4 | authenticated | false | true | `/onboarding` |
| 5 | unauthenticated | true | false | `/(auth)/login` |
| 6 | hydrating | true | true | `/(auth)/login` |
| 7 | authenticated | true | false | `/(app)/permission` |
| 8 | authenticated | true | true | `/(app)` |

**Không có vòng lặp redirect** — kiểm cả ba nhánh:

- #5/#6 → login; guard `(auth)` chỉ đá đi khi `authenticated` ⇒ dừng.
- #7 → `(app)/permission`; guard `(app)` chỉ đá đi khi **chưa** auth ⇒ dừng.
- Sau `markOnboardingCompleted()` cờ đã `true` **đồng bộ** trong store (phase 02) ⇒ lần vào lại
  `index` rơi xuống nhánh dưới, không quay lại `/onboarding`.

## File liên quan

**Tạo:** `src/navigation/bootstrap-route.ts` + `.test.ts` ·
`src/navigation/app-index-redirect.test.tsx` · `src/navigation/auth-group-layout.test.tsx`.
**Sửa:** `src/navigation/route-guards.ts` · `app/index.tsx` · `app/(auth)/_layout.tsx`.
**Xoá:** không.

> **Không đụng** `src/navigation/route-guards.test.ts` và `app-group-layout.test.tsx` — hai file đó
> đang xanh và phủ đúng thứ chúng phủ.

## Các bước

1. Thêm 3 hằng vào `route-guards.ts` (chỉ thêm, không sửa cái cũ).
2. `bootstrap-route.ts` + doc comment ghi thẳng bất biến **"mọi lối xong đều `replace('/')`"** — đây
   là nơi người sửa sau sẽ đọc.
3. `bootstrap-route.test.ts`: cả 8 dòng bảng trên, mỗi dòng một `it`.
4. Sửa `app/index.tsx`.
5. `app-index-redirect.test.tsx` theo khuôn `app-group-layout.test.tsx`: mock `expo-router`
   (`Redirect`), mock hai store; khẳng định `href` đúng ở 4 tình huống tiêu biểu (#3, #5, #7, #8).
6. Sửa `app/(auth)/_layout.tsx`: `APP_HOME_ROUTE` → `ROOT_ROUTE`.
7. `auth-group-layout.test.tsx`: đã auth → `Redirect` tới **`'/'`** (không phải `/(app)`);
   chưa auth và đang hydrate → render `Stack`.
8. lint + typecheck + test (kể cả 2 file test cũ phải vẫn xanh).

## Todo

- [x] 3 hằng route mới
- [x] `bootstrap-route.ts` + doc comment bất biến
- [x] `bootstrap-route.test.ts` (8 case)
- [x] `app/index.tsx`
- [x] `app-index-redirect.test.tsx` (4 case)
- [x] `(auth)/_layout.tsx` đổi đích
- [x] `auth-group-layout.test.tsx` (3 case)
- [x] test cũ `route-guards.test.ts` + `app-group-layout.test.tsx` vẫn xanh

## Chuẩn hoàn thành (đo được)

| Tiêu chí | Cách kiểm |
|---|---|
| 8 tổ hợp đều có test và ra đúng đích | `bootstrap-route.test.ts` |
| `(auth)` khi đã auth redirect tới `'/'`, **không** `/(app)` | `auth-group-layout.test.tsx` |
| `app/index.tsx` không còn đích cứng | `grep -n "APP_HOME_ROUTE" apps/mobile/app/index.tsx` rỗng |
| `bootstrap-route.ts` không import runtime | `grep -n "^import" src/navigation/bootstrap-route.ts` chỉ có `import type` |
| `app/index.tsx` < 25 dòng | `wc -l` |
| 39 test cũ vẫn xanh | `yarn workspace @meetio/mobile test` |
| Số test tăng ≥ 15 | |

## Rủi ro

| Rủi ro | K × T | Đối sách |
|---|---|---|
| Quên sửa `(auth)/_layout.tsx` ⇒ đăng nhập xong **bỏ qua** màn quyền | Cao × Trung | Có test riêng khoá đích redirect; nằm trong Todo như một mục độc lập |
| Vòng lặp redirect giữa index và một guard | Thấp × Cao | Bảng 8 tổ hợp + phần "không có vòng lặp" ở trên đã truy hết ba nhánh; test phủ |
| Có người thêm cổng mới nhưng điều hướng thẳng tới màn kế thay vì `'/'` | Trung × Trung | Bất biến viết trong doc comment của chính hàm; phase 06/07 có test khẳng định `replace('/')` |
| Sửa `route-guards.ts` làm vỡ test cũ | Thấp × Thấp | Chỉ **thêm** hằng, không đổi hàm; test cũ chạy lại trong cùng phase |

**Rollback:** `git revert`. `app/index.tsx` trở lại redirect cứng, `(auth)` trở lại `/(app)`. Hệ quả
duy nhất là onboarding/permission không tới được — không hỏng dữ liệu.

## An toàn / bảo mật

Bộ định tuyến **không nới lỏng** guard nào. `(app)` vẫn chặn cứng khi chưa auth; `/(app)/permission`
nằm **trong** group đó nên thừa hưởng nguyên chốt chặn. Onboarding nằm ngoài mọi guard, và đó là
đúng — nó không hiển thị dữ liệu nào của người dùng.

## Tiếp theo

Mở khoá phase 06 và 07 (cả hai cần `ROOT_ROUTE` và cần route đích đã được trỏ tới).
