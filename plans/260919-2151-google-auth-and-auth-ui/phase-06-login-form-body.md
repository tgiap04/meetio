---
phase: 06
title: "Thân form Đăng nhập"
status: completed
priority: P1
effort: 2h
blockedBy: [04, 05]
blocks: [10]
---

# Phase 06 — Thân form Đăng nhập

**Liên kết:** [plan.md](plan.md) · [decisions §9 (dẫn xuất, không sao chép)](decisions.md) ·
[decisions §10 (A thuần trình bày)](decisions.md) · [file-ownership.md](file-ownership.md) ·
[phase-05 (khung)](phase-05-auth-chrome-and-google-button.md)

## Tổng quan

Toàn bộ phần **nhìn và tương tác cục bộ** của màn đăng nhập, gói trong một component nhận mọi thứ
qua props. Không hook, không mạng, không điều hướng — phase 10 lo những thứ đó.

Đây là chỗ khuôn `permission.tsx` mỏng + `permission-body.tsx` dày của repo được lặp lại: nhờ nó,
màn đăng nhập test được **không cần** mock `expo-router`, `@tanstack/react-query`, hay thư viện
native nào.

## Nhận định then chốt

- **Màn hiện tại là form trần**: `View` căn giữa, hai `TextField`, một `PrimaryButton`, một `Link`.
  Không nền, không nhận diện, không phân cấp. Bản dựng lại thay tất cả phần đó bằng
  `AuthScreenShell`.
- **Nợ tương phản trả ở đây.** `login.tsx` hiện dùng `colors.primary` cho link chữ trên nền sáng —
  2,62:1, đúng thứ quy ước trong `colors.ts` cấm. Bản mới dùng `colors.primaryStrong`. Đây là món nợ
  kế hoạch trước đã ghi nhận và cố ý để lại.
- **`DevResetButton` phải giữ lại.** Nó chỉ có mặt ở hai màn — login và settings — và là **đường
  duy nhất** thấy lại onboarding trên iOS (Keychain sống sót qua gỡ app). Bỏ nó là bịt lối thoát của
  chính mình lúc QA.
- **Tự xác thực phía client: không làm.** Ô email không kiểm định dạng tại chỗ. Máy chủ đã trả
  `VALIDATION_ERROR` có `details` theo từng field, và `getErrorMessage` đã dịch sẵn. Thêm một bộ
  luật thứ hai ở client là hai nguồn sự thật lệch nhau (YAGNI).

## Yêu cầu

**Chức năng**

`<LoginForm {...props} />`, props:

| Prop | Kiểu | Việc |
|---|---|---|
| `email`, `password` | `string` | giá trị được điều khiển |
| `onChangeEmail`, `onChangePassword` | `(v: string) => void` | |
| `onSubmit` | `() => void` | bấm nút chính, hoặc `onSubmitEditing` ở ô mật khẩu |
| `submitting` | `boolean` | `PrimaryButton.loading` |
| `errorMessage` | `string \| null` | lỗi của đường email/mật khẩu |
| `onGooglePress` | `() => void` | |
| `googlePending` | `boolean` | `GoogleSignInButton.loading` |
| `googleErrorMessage` | `string \| null` | lỗi của đường Google, **dòng riêng** |
| `onNavigateToRegister` | `() => void` | |

Thứ tự dọc: tiêu đề → hai ô nhập → lỗi email/mật khẩu (nếu có) → `PrimaryButton "Đăng nhập"` →
`AuthDivider` → `GoogleSignInButton` → lỗi Google (nếu có) → link "Chưa có tài khoản? Đăng ký" →
`DevResetButton`.

Ràng buộc hành vi:

1. **Hai dòng lỗi tách biệt.** Lỗi Google hiện dưới nút Google, không trộn vào lỗi email/mật khẩu.
   Trộn chung thì "Email hoặc mật khẩu không đúng" xuất hiện sau khi bấm nút Google — vô nghĩa.
2. **Một đường chạy thì đường kia khoá.** `submitting` ⇒ nút Google `disabled`; `googlePending` ⇒
   `PrimaryButton` `disabled`. Hai phiên đăng nhập đồng thời là hai `persistSession` đua nhau.
3. Ô email: `autoCapitalize="none"`, `keyboardType="email-address"`, `autoComplete="email"`,
   `returnKeyType="next"`.
4. Ô mật khẩu: `secureTextEntry`, `autoComplete="current-password"`, `returnKeyType="go"`,
   `onSubmitEditing={onSubmit}`.
5. Link chữ dùng `colors.primaryStrong`.

**Phi chức năng**

- File < 200 dòng. Vượt thì tách phần "khối Google" thành component con **trong cùng phase**.
- Không import `expo-router`, `@tanstack/react-query`, `zustand`, `@react-native-google-signin/*`,
  `../api/*`.
- `DevResetButton` là ngoại lệ được phép import — nó tự lo `__DEV__` bên trong.

## Giao cho `ui-ux-designer`

Số đo, khoảng cách, cỡ chữ tiêu đề, có `subtitle` hay không, cách trình bày dòng lỗi — **giao cho
agent `ui-ux-designer`**, bật skill `tkm:design-ui`. Ràng buộc: chỉ dùng token sẵn có, chỉ dùng
component của phase 04/05, thứ tự dọc như trên, và **không so với `design.png`** (không có màn này).

## File liên quan

Tạo: `apps/mobile/src/components/auth/login-form.tsx` + `login-form.test.tsx`

## Các bước triển khai

1. Viết `login-form.test.tsx` trước — mọi ca ở bảng nghiệm thu đều test được bằng
   `react-test-renderer` + `act`, không mock gì.
2. Dựng component bằng `AuthScreenShell` + `TextField` + `PrimaryButton` + `AuthDivider` +
   `GoogleSignInButton` + `DevResetButton`.
3. Chạy test; đối chiếu số test xanh toàn workspace không giảm.

## Todo

- [ ] `login-form.test.tsx`
- [ ] `login-form.tsx`
- [ ] Link chữ dùng `primaryStrong` (trả nợ tương phản)
- [ ] `DevResetButton` vẫn còn

## Tiêu chí nghiệm thu (quan sát được)

| # | Test / lệnh | Kỳ vọng |
|---|---|---|
| 1 | `yarn typecheck && yarn lint && yarn workspace @meetio/mobile run test` | thoát 0 |
| 2 | `LoginForm gọi onSubmit khi bấm nút chính` | pass |
| 3 | `LoginForm gọi onGooglePress khi bấm nút Google` | pass |
| 4 | `submitting thì nút Google bị khoá` | `accessibilityState.disabled === true` |
| 5 | `googlePending thì nút Đăng nhập bị khoá` | như trên |
| 6 | `lỗi Google hiện ở dòng riêng, không lẫn với lỗi email/mật khẩu` — render cả hai message, khẳng định hai node khác nhau | pass |
| 7 | `LoginForm giữ DevResetButton` — `findByProps({testID:'dev-reset-button'})` | tồn tại |
| 8 | `link chữ dùng primaryStrong chứ không phải primary` | `color === colors.primaryStrong` |
| 9 | `grep -E "expo-router\|@tanstack\|zustand\|google-signin\|api/" src/components/auth/login-form.tsx` | **không kết quả** |
| 10 | `wc -l src/components/auth/login-form.tsx` | `< 200` |
| 11 | test cũ `src/components/dev/dev-reset-button.test.tsx` | **vẫn xanh, không sửa** |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| Bỏ quên `DevResetButton` khi dựng lại ⇒ mất lối duy nhất xem lại onboarding trên iOS | Cao × Trung | AC #7 khóa |
| Nhét hook vào cho "tiện" ⇒ nhánh A hết độc lập, phase 10 phải gỡ ra | Trung × Cao | AC #9 là một lệnh `grep` |
| Hai đường đăng nhập chạy đồng thời ⇒ hai `persistSession` đua | Thấp × Cao | AC #4 + #5 khoá chéo ở tầng UI; phase 09 khoá thêm ở tầng hook |
| File phình quá 200 dòng | Trung × Thấp | Tách khối Google thành component con trong cùng phase |

## Bảo mật

- Ô mật khẩu **bắt buộc** `secureTextEntry`. Không làm nút "hiện mật khẩu" trong phase này (YAGNI,
  và nó là một bề mặt nhìn trộm qua vai).
- `autoComplete="current-password"` để trình quản lý mật khẩu của hệ điều hành vào đúng ô — nó đẩy
  người dùng về phía mật khẩu mạnh, đơn lẻ.
- **Không `console.log` props.** Component này cầm mật khẩu ở dạng thô trong bộ nhớ trong lúc gõ.
- Dòng lỗi chỉ hiển thị **đúng chuỗi máy chủ gửi** (hoặc câu dự phòng của `getErrorMessage`). Không
  ghép thêm email vào thông báo — đó là cách vô tình tạo màn liệt kê tài khoản.

## Đường lùi

`git revert` một commit; `app/(auth)/login.tsx` **chưa bị đụng tới** ở phase này (phase 10 mới sửa),
nên màn đăng nhập cũ vẫn chạy nguyên trong suốt thời gian đó. Đây là lợi ích trực tiếp của việc
tách thân form khỏi route.

## Tiếp theo

Cùng với **07** mở khóa **10** (nối dây route).
