---
phase: 05
title: "Khung màn auth + nút Google (thuần trình bày)"
status: completed
priority: P1
effort: 2h
blockedBy: []
blocks: [06, 07]
---

# Phase 05 — Khung màn auth + nút Google

**Liên kết:** [plan.md](plan.md) · [decisions §9 (design.png không có màn auth)](decisions.md) ·
[decisions §10 (A thuần trình bày)](decisions.md) · [file-ownership.md](file-ownership.md) ·
[Kế hoạch màn 1–3](../260918-0033-mobile-splash-onboarding-permission/plan.md)

> **`design.png` KHÔNG có màn đăng nhập hay đăng ký.** Ảnh có 13 màn, đánh số 1–10 và 12–14. Không
> đi "so với design" — không có gì để so. Ngôn ngữ thị giác **dẫn xuất từ màn 1–3 đã dựng**.

## Tổng quan

Phần **nhìn** dùng chung của hai màn auth, tách thành component không biết gì về routing, mạng, hay
thư viện native. Hai phase sau (06, 07) chỉ việc lắp; phase 10 mới cắm dây.

Đây là phase giữ cho nhánh A thật sự không phụ thuộc nhánh B: **không file nào ở đây import**
`expo-router`, `@tanstack/react-query`, `zustand`, hay `@react-native-google-signin/*`.

## Nhận định then chốt

- **Dẫn xuất, không sáng tác.** Sáu thứ lấy thẳng từ màn 1–3 đã nghiệm thu:

  | Lấy gì | Từ đâu |
  |---|---|
  | nền kem + hai mảng peach tràn mép | `ScreenBackdrop` |
  | ô icon gradient | `AppMark` |
  | wordmark "Meetio" | `typography.display` |
  | tiêu đề hai dòng | `typography.heading` |
  | in đậm "Meetio" giữa đoạn | `BrandedParagraph` |
  | link chữ cam trên nền sáng | `colors.primaryStrong` — **không** `colors.primary` |

- **`ScreenBackdrop` cần `width`.** Nó nhận chiều rộng màn hình để scale mảng peach. Lấy bằng
  `useWindowDimensions()` của `react-native` (không phải `Dimensions.get`, vốn không cập nhật khi
  xoay máy).
- **Bàn phím là vấn đề thật ở màn auth**, khác hẳn màn 1–3 vốn không có ô nhập. Khung phải bọc
  `KeyboardAvoidingView` + `ScrollView` (`keyboardShouldPersistTaps="handled"`), nếu không nút gửi
  nằm dưới bàn phím trên máy nhỏ.
- **Dấu G phải là dấu chính chủ.** Không vẽ lại bằng `View` — đó là nhãn hiệu của Google và vẽ tay
  vừa sai thương hiệu vừa xấu. Tải asset từ trang branding của Google về
  `apps/mobile/assets/google-g.png` (+ `@2x`, `@3x`), render bằng `<Image>`. Repo **chưa có**
  `react-native-svg` và phase này **không thêm**.

## Yêu cầu

**Chức năng**

1. `<AuthScreenShell title subtitle? children />`
   - `ScreenBackdrop` (rộng theo `useWindowDimensions`) → `KeyboardAvoidingView`
     (`behavior: Platform.OS === 'ios' ? 'padding' : 'height'`) → `ScrollView` → nội dung;
   - trên đầu: `AppMark` + wordmark, rồi `title` (`typography.heading`), rồi `subtitle` nếu có;
   - `children` là phần form;
   - nhận `testID` tuỳ chọn.
2. `<GoogleSignInButton onPress loading? disabled? testID? />`
   - nền trắng (`colors.background`), viền `colors.border`, bo góc 8, chữ `colors.text`;
   - dấu G bên trái, nhãn `"Tiếp tục với Google"`;
   - `loading` ⇒ `ActivityIndicator` (màu `colors.text`) thay nhãn, `disabled` tự bật;
   - `accessibilityRole="button"`, `accessibilityState={{ disabled }}`;
   - **thuần trình bày**: không hook, không mạng, không biết Google là gì ngoài cái tên.
3. `<AuthDivider label="hoặc" />` — hai gạch `colors.border` hai bên, chữ `colors.textMuted` ở giữa.

**Phi chức năng**

- Mỗi file < 200 dòng (dự kiến đều < 80).
- Không import `expo-router`, `zustand`, `@tanstack/react-query`, `@react-native-google-signin/*`.
- Mọi component nhận `testID` tuỳ chọn để phase sau khẳng định được sự có mặt.
- Không thêm token vào `colors.ts` / `typography.ts`.

## Giao cho `ui-ux-designer`

Bố cục, khoảng cách, tỉ lệ `AppMark`, thứ tự dọc, có `subtitle` hay không — **giao cho agent
`ui-ux-designer`** lúc triển khai, bật skill `tkm:design-ui`. Phase này chốt ràng buộc:

- dùng lại sáu thứ ở bảng trên, không tự đặt màu/khoảng cách mới;
- nút Google là nút **phụ** — không được cạnh tranh thị giác với `PrimaryButton` cam;
- chữ cam trên nền sáng **bắt buộc** `primaryStrong` (`primary` chỉ đạt 2,62:1);
- vùng chạm ≥ 44pt; chữ thang tỉ lệ theo cỡ chữ hệ thống.

## Hợp đồng bàn giao (phase 06/07 tiêu thụ — **không được đổi**)

```ts
interface AuthScreenShellProps   { title: string; subtitle?: string; children: ReactNode; testID?: string }
interface GoogleSignInButtonProps{ onPress: () => void; loading?: boolean; disabled?: boolean; testID?: string }
interface AuthDividerProps       { label?: string }
```

## File liên quan

Tạo: `src/components/auth/auth-screen-shell.tsx` · `src/components/auth/google-sign-in-button.tsx` ·
`src/components/auth/auth-divider.tsx` · `src/components/auth/auth-chrome.test.tsx` ·
`assets/google-g.png` (+`@2x`, `@3x`) — tất cả dưới `apps/mobile/`

## Các bước triển khai

1. Tải bộ `google-g` từ trang branding chính thức của Google về `apps/mobile/assets/`.
   **Không có mạng lúc triển khai** ⇒ dừng lại và báo; đường lùi là nút chữ không có dấu G, và phải
   ghi lại là nợ, không lặng lẽ vẽ một hình tròn nhiều màu.
2. `AuthDivider` (nhỏ nhất) → `GoogleSignInButton` → `AuthScreenShell`.
3. Một file test gộp `auth-chrome.test.tsx` cho cả ba, đúng tiền lệ `illustrations.test.tsx`.

## Todo

- [ ] Asset `google-g` chính chủ trong `assets/`
- [ ] `AuthDivider`
- [ ] `GoogleSignInButton`
- [ ] `AuthScreenShell`
- [ ] `auth-chrome.test.tsx`

## Tiêu chí nghiệm thu (quan sát được)

| # | Test / lệnh | Kỳ vọng |
|---|---|---|
| 1 | `yarn typecheck && yarn lint && yarn workspace @meetio/mobile run test` | thoát 0 |
| 2 | `AuthScreenShell dựng nền peach của màn 1-3` — `findByProps({testID:'auth-backdrop-top'})` và `-bottom` | cả hai tồn tại |
| 3 | `AuthScreenShell scale nền theo chiều rộng màn hình` — mock `useWindowDimensions` hai giá trị, `size` của blob khác nhau | pass |
| 4 | `GoogleSignInButton disabled thì không gọi onPress` | pass |
| 5 | `GoogleSignInButton loading hiện ActivityIndicator và giấu nhãn` | pass |
| 6 | `GoogleSignInButton là nút phụ, không dùng màu nền thương hiệu` — khẳng định `backgroundColor !== colors.primary` và **không** có `LinearGradient` trong cây | pass |
| 7 | `không component nào của phase 05 import router/store/query/google-signin` — `grep -E "expo-router\|zustand\|@tanstack\|google-signin" src/components/auth/*.tsx` | **không kết quả** |
| 8 | `for f in src/components/auth/*.tsx; do wc -l $f; done` | mọi file `< 200` |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| Không lấy được asset G chính chủ lúc triển khai | Trung × Trung | Lùi về nút chữ, **ghi thành nợ tường minh**, không tự vẽ logo Google |
| `KeyboardAvoidingView` lệch hành vi giữa iOS và Android | Cao × Trung | `Platform.select` cho `behavior`; QA máy thật hai nền tảng ở phase 11 — Jest không kiểm được bàn phím |
| Nút Google nổi hơn nút chính ⇒ đẩy người dùng khỏi luồng email | Trung × Thấp | AC #6 khóa ở mức token; cân bằng thị giác do `ui-ux-designer` quyết |
| Vô tình import thư viện native ⇒ nhánh A hết độc lập | Trung × Cao | AC #7 là một lệnh `grep`, chạy được trong CI về sau nếu muốn |
| Sao chép `design.png` một màn không tồn tại | Trung × Trung | Cảnh báo in đậm đầu file này, ở [plan.md](plan.md) và ở [decisions §9](decisions.md) |

## Bảo mật

Không có mặt bảo mật trực tiếp — không mạng, không lưu trữ, không nhận credential. Hai điều liên
quan gián tiếp:

- **Ô mật khẩu thuộc phase 06/07**, không thuộc khung này. `AuthScreenShell` bọc `ScrollView`; đừng
  bật `keyboardShouldPersistTaps="always"` (nó giữ bàn phím qua mọi chạm và dễ gây chạm nhầm nút gửi)
  — dùng `"handled"`.
- **Không `console.log` prop nào** trong các component này; chúng sẽ nhận email và mật khẩu qua
  `children` ở phase sau.

## Đường lùi

`git revert` một commit. Bốn file mới, không file cũ nào bị sửa, không dependency, không asset nào
được phase khác dùng.

## Tiếp theo

Mở khóa **06** và **07**, chạy song song được vì mỗi phase một file form riêng.
