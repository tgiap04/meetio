---
phase: 07
title: "Thân form Đăng ký"
status: completed
priority: P1
effort: 1.5h
blockedBy: [04, 05]
blocks: [10]
---

# Phase 07 — Thân form Đăng ký

**Liên kết:** [plan.md](plan.md) · [decisions §9](decisions.md) · [decisions §10](decisions.md) ·
[file-ownership.md](file-ownership.md) · [phase-05 (khung)](phase-05-auth-chrome-and-google-button.md) ·
[phase-06 (form chị em)](phase-06-login-form-body.md)

## Tổng quan

Song sinh của [phase 06](phase-06-login-form-body.md) cho màn đăng ký. Chạy **song song** với 06 —
hai file khác nhau, không giẫm chân.

Rẻ hơn 06 nửa giờ vì mọi quyết định khung đã chốt ở 05 và mọi quyết định hành vi đã chốt ở 06; phase
này áp dụng chúng cho ba ô nhập.

## Nhận định then chốt

- **Nút Google xuất hiện ở cả hai màn, cùng một nút, cùng một hành vi.** Với Google không có phân
  biệt "đăng ký" và "đăng nhập": cùng một ID token, máy chủ tự quyết là tạo mới, liên kết, hay đăng
  nhập (phase 03). Nên nhãn giữ nguyên `"Tiếp tục với Google"` ở **cả hai** màn — đổi thành "Đăng ký
  với Google" là hứa một hành vi khác với thứ thật sự xảy ra.
- **Ba ô, không phải hai**: họ tên hiển thị, email, mật khẩu — khớp `RegisterRequest`.
- Ràng buộc mật khẩu của máy chủ là `@Length(8, 128)`. **Không** dựng lại luật đó ở client; hiển thị
  gợi ý tĩnh "ít nhất 8 ký tự" dưới ô là đủ, còn phán quyết vẫn của máy chủ (một nguồn sự thật).
- **Không có `DevResetButton`** ở màn này — kế hoạch trước cố ý chỉ đặt ở login và settings.

## Yêu cầu

**Chức năng**

`<RegisterForm {...props} />` — cùng khuôn props như `LoginForm`, thêm `displayName` /
`onChangeDisplayName`, bỏ `onNavigateToRegister` và thay bằng `onNavigateToLogin`.

Thứ tự dọc: tiêu đề → họ tên → email → mật khẩu (kèm gợi ý "ít nhất 8 ký tự") → lỗi (nếu có) →
`PrimaryButton "Đăng ký"` → `AuthDivider` → `GoogleSignInButton` → lỗi Google (nếu có) → link
"Đã có tài khoản? Đăng nhập".

Giữ nguyên bốn ràng buộc hành vi của phase 06: hai dòng lỗi tách biệt · khoá chéo hai đường ·
thuộc tính bàn phím đúng từng ô · link dùng `colors.primaryStrong`.

Thuộc tính ô nhập: họ tên `autoCapitalize="words"`, `autoComplete="name"`, `returnKeyType="next"` ·
email như phase 06 · mật khẩu `autoComplete="new-password"` (**không** `current-password` — đây là
ô tạo mật khẩu, và đó là tín hiệu để trình quản lý mật khẩu **sinh** mật khẩu thay vì điền lại cái cũ).

**Phi chức năng**

- File < 200 dòng. Cùng danh sách cấm import như phase 06.
- **Không** trích xuất phần chung với `LoginForm` thành component thứ ba ở phase này: hai file do hai
  phase song song sở hữu, gộp là tạo chủ sở hữu chung. Nếu sau khi cả hai xong mà phần lặp lại đáng
  kể, đó là việc của `code-simplifier` sau phase 10, không phải của phase này.

## Giao cho `ui-ux-designer`

Như phase 06: số đo và nhịp thị giác giao cho agent `ui-ux-designer` với skill `tkm:design-ui`;
ràng buộc là token sẵn có, component của phase 04/05, thứ tự dọc như trên, **không so với `design.png`**.
Thêm một ràng buộc riêng: ba ô nhập trên một màn có bàn phím phải vẫn cuộn tới được nút gửi trên máy
màn nhỏ.

## File liên quan

Tạo: `apps/mobile/src/components/auth/register-form.tsx` + `register-form.test.tsx`

## Các bước triển khai

1. Test trước, đúng khuôn phase 06.
2. Dựng component.
3. Chạy test toàn workspace, số test xanh không giảm.

## Todo

- [ ] `register-form.test.tsx`
- [ ] `register-form.tsx`
- [ ] Nhãn nút Google giống hệt màn login
- [ ] `autoComplete="new-password"` ở ô mật khẩu

## Tiêu chí nghiệm thu (quan sát được)

| # | Test / lệnh | Kỳ vọng |
|---|---|---|
| 1 | `yarn typecheck && yarn lint && yarn workspace @meetio/mobile run test` | thoát 0 |
| 2 | `RegisterForm gọi onSubmit với đủ ba giá trị` | pass |
| 3 | `RegisterForm gọi onGooglePress` | pass |
| 4 | `submitting khoá nút Google` và `googlePending khoá nút Đăng ký` | pass |
| 5 | `lỗi Google hiện ở dòng riêng` | pass |
| 6 | `ô mật khẩu dùng autoComplete="new-password"` | pass |
| 7 | `nhãn nút Google giống hệt màn đăng nhập` — khẳng định đúng chuỗi `'Tiếp tục với Google'` | pass |
| 8 | `link chữ dùng primaryStrong` | pass |
| 9 | `grep -E "expo-router\|@tanstack\|zustand\|google-signin\|api/" src/components/auth/register-form.tsx` | **không kết quả** |
| 10 | `wc -l src/components/auth/register-form.tsx` | `< 200` |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| Nhãn nút Google lệch giữa hai màn ⇒ hứa hành vi không có thật | Trung × Thấp | AC #7 khóa đúng chuỗi |
| Dựng lại luật mật khẩu ở client rồi lệch với `@Length(8,128)` của máy chủ | Trung × Trung | Chỉ hiện gợi ý tĩnh, không chặn nút. Phán quyết ở máy chủ |
| Hai phase song song cùng "gọn hoá" phần chung ⇒ đụng file | Trung × Trung | Cấm tường minh; việc đó thuộc `code-simplifier` sau phase 10 |
| Ba ô + bàn phím ⇒ nút gửi khuất trên máy nhỏ | Trung × Trung | `AuthScreenShell` đã bọc `KeyboardAvoidingView` + `ScrollView`; xác nhận bằng QA máy thật ở phase 11 |

## Bảo mật

- `autoComplete="new-password"` không phải chi tiết thẩm mỹ: nó là tín hiệu để iOS/Android **đề
  xuất mật khẩu mạnh**, thứ hiệu quả hơn mọi thanh đo độ mạnh vẽ tay.
- Không có nút "hiện mật khẩu" (như phase 06).
- Máy chủ trả `VALIDATION_ERROR` với `details.email = ['already_registered']` khi email đã tồn tại.
  **Đây là rò rỉ liệt kê tài khoản đã có sẵn trong sản phẩm**, không phải do phase này gây ra. Ghi
  nhận ở đây để không bị mất dấu; sửa nó là một thay đổi hợp đồng API, ngoài phạm vi kế hoạch này.

## Đường lùi

`git revert` một commit; `app/(auth)/register.tsx` chưa bị đụng ở phase này, màn đăng ký cũ vẫn chạy.

## Tiếp theo

Cùng với **06** mở khóa **10**.
