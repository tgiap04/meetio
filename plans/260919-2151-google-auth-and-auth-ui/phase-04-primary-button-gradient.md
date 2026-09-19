---
phase: 04
title: "PrimaryButton chuyển gradient"
status: completed
priority: P2
effort: 1h
blockedBy: []
blocks: [06, 07]
---

# Phase 04 — `PrimaryButton` chuyển gradient

**Liên kết:** [plan.md](plan.md) · [decisions §11 (bán kính ảnh hưởng)](decisions.md) ·
[file-ownership.md](file-ownership.md) · [design.png](../../design.png)

> **Phase này chạm 5 màn ĐÃ NGHIỆM THU.** Đọc hết mục "Bán kính ảnh hưởng" trước khi gõ dòng đầu tiên.

## Tổng quan

`design.png` vẽ **mọi** nút chính là gradient cam chéo. `PrimaryButton` đang là
`backgroundColor: colors.primary` phẳng. `BrandFill` đã tồn tại, đã đúng hai điểm màu đo được, đã có
test khóa hướng. Đây là ba dòng code — cái đắt là bán kính ảnh hưởng, không phải việc làm.

Tách thành phase riêng **chính vì** nó không chỉ phục vụ màn auth: nó sửa năm màn đang lệch design
theo cùng một cách.

## Nhận định then chốt

- **`BrandFill` không phải viết mới.** Nó đã sống trong `src/components/illustrations/brand-fill.tsx`,
  đã bọc `LinearGradient` với `colors.primaryGradientFrom → primaryGradientTo`, `start {0,0}`,
  `end {1,1}`. Ba hình cam khác (`AppMark`, `MicPermissionArt`, `OnboardingArt`) đã dùng nó.
- **`expo-linear-gradient` đã là dependency** (`~57.0.2`) và đã chạy trên máy thật ở màn 1–3. Không
  thêm thư viện, **không** cần vòng prebuild nào.
- **Khuôn test đã có sẵn** trong `brand-surfaces.test.tsx`: `renderer.root.findByType(LinearGradient)`
  rồi khẳng định `colors` / `start` / `end`. Dùng lại y nguyên, đừng nghĩ khuôn mới.
- `PrimaryButton` **chưa từng có file test**. Phase này thêm file đó — giá trị của nó lớn hơn hẳn
  phạm vi thay đổi, vì nút này có mặt ở 7 chỗ.

## Bán kính ảnh hưởng (đếm bằng `grep`, không bằng trí nhớ)

| File dùng `PrimaryButton` | Màn | Đã nghiệm thu? |
|---|---|---|
| `app/onboarding.tsx` | 2 — Onboarding | ✅ |
| `src/components/permission/permission-body.tsx` | 3 — Quyền micro | ✅ |
| `app/(app)/index.tsx` | 4 — Trang chủ | ✅ |
| `app/(app)/consent.tsx` | Đồng ý ghi âm | ✅ |
| `app/(app)/settings.tsx` | 14 — Cài đặt | ✅ |
| `app/(auth)/login.tsx` · `register.tsx` | dựng lại ở phase 06/07/10 | — |

**Điều kiện cứng: không sửa một test nào đang xanh.** Nếu một test cũ đỏ, nghĩa là hành vi đã đổi
chứ không phải test sai — dừng lại và báo, đừng chữa test.

Năm màn trên vào lại danh sách QA thị giác ở [phase 11](phase-11-env-readme-native-rebuild-qa.md).

## Yêu cầu

**Chức năng**

1. Gốc của nút đổi từ `Pressable` có `backgroundColor` sang `Pressable` bọc `BrandFill`:
   - `Pressable` **vẫn ở ngoài cùng** — `accessibilityRole="button"`, `accessibilityState`,
     `disabled`, `onPress`, và mọi `PressableProps` khác **không đổi một chữ**;
   - `BrandFill` nhận `style` mang `borderRadius: 8`, `paddingVertical: 14`, căn giữa;
   - `borderRadius` phải nằm trên **chính** `LinearGradient`, không phải trên `Pressable` bọc ngoài —
     nếu không, bốn góc sẽ là hình chữ nhật cam tràn ra.
2. Trạng thái `disabled`/`loading` giữ nguyên `opacity: 0.5` như hiện tại, áp lên `Pressable`.
3. `ActivityIndicator` và nhãn giữ nguyên `colors.primaryText`.
4. **Props không đổi.** `PrimaryButtonProps` là hợp đồng với 7 chỗ gọi — giữ nguyên hoàn toàn.

**Phi chức năng**

- File < 200 dòng (hiện 40, sau khi đổi ~50).
- Không thêm dependency, không đụng `colors.ts`.
- Không đổi `BrandFill` — nó thuộc bộ đã nghiệm thu và ba component khác đang dùng.

## Giao cho `ui-ux-designer`

Số đo cuối (padding, bo góc, có cần `shadow`/`elevation` không, trạng thái `pressed` có tối đi
không) **giao cho agent `ui-ux-designer`** lúc triển khai, và agent đó bật skill `tkm:design-ui`.
Phase này chốt **ràng buộc**, không chốt số đo:

- dùng `BrandFill`, không tự gọi `LinearGradient` (DRY — hai điểm màu phải giống nhau ở mọi chỗ);
- không thêm token màu mới;
- chữ trắng trên cam giữ nguyên, kèm hụt AA đã ghi nhận trong `colors.ts`;
- vùng chạm ≥ 44pt.

## File liên quan

Sửa: `apps/mobile/src/components/primary-button.tsx`
Tạo: `apps/mobile/src/components/primary-button.test.tsx`

## Các bước triển khai

1. Chạy `yarn workspace @meetio/mobile run test` **trước khi sửa**, ghi lại số test xanh.
2. Viết `primary-button.test.tsx` trước: gradient hiện diện · props đi xuyên qua · `disabled` chặn
   `onPress` · `loading` hiện `ActivityIndicator` thay vì nhãn.
3. Sửa component.
4. Chạy lại test, so số: **mọi test cũ vẫn xanh**, cộng thêm các ca mới.

## Todo

- [ ] Ghi số test xanh trước khi sửa
- [ ] `primary-button.test.tsx` (4 ca)
- [ ] `PrimaryButton` dùng `BrandFill`
- [ ] Đối chiếu số test sau khi sửa

## Tiêu chí nghiệm thu (quan sát được)

| # | Test / lệnh | Kỳ vọng |
|---|---|---|
| 1 | `yarn workspace @meetio/mobile run test` | thoát 0, **số test xanh ≥ số ghi ở bước 1**, và **không file test cũ nào bị sửa** (`git diff --name-only` không có file `.test.*` nào ngoài file mới) |
| 2 | `PrimaryButton vẽ gradient chứ không phải màu phẳng` — `findByType(LinearGradient)`, khẳng định `colors`/`start`/`end` đúng khuôn `brand-surfaces.test.tsx` | pass |
| 3 | `PrimaryButton truyền nguyên PressableProps xuống` — `testID`, `accessibilityLabel` tới được host node | pass |
| 4 | `PrimaryButton disabled thì onPress không chạy` | pass |
| 5 | `PrimaryButton loading hiện ActivityIndicator và giấu nhãn` | pass |
| 6 | `yarn typecheck && yarn lint` | thoát 0 |
| 7 | `wc -l apps/mobile/src/components/primary-button.tsx` | `< 200` |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| `borderRadius` đặt sai tầng ⇒ góc vuông cam thò ra ở cả 7 chỗ | Trung × Trung | Đặt trên `LinearGradient`; AC #2 + QA thị giác phase 11 |
| Một test cũ đỏ và bị "chữa" thay vì bị điều tra | Trung × Cao | AC #1 kiểm bằng `git diff --name-only`, không bằng lời hứa |
| `LinearGradient` nuốt sự kiện chạm ở một nền tảng | Thấp × Cao | `Pressable` **ở ngoài** gradient, không phải trong. AC #4 khóa ở JS; QA máy thật ở phase 11 khóa ở native |
| Nút trông "nặng" hơn ở màn 4/14 nơi có nhiều nút liền nhau | Trung × Thấp | Đưa vào danh sách QA thị giác phase 11; lùi được bằng một dòng |

## Bảo mật

Không có mặt bảo mật. Component thuần trình bày, không chạm mạng, không chạm lưu trữ, không nhận
dữ liệu người dùng. Ghi ra đây để lần rà soát sau không phải đi tìm.

## Đường lùi

`git revert` một commit — `BrandFill` quay về đúng ba chỗ gọi cũ, `PrimaryButton` về màu phẳng.
Không có trạng thái nào tồn tại sau revert. Không phase nào khác sửa file này.

## Tiếp theo

Mở khóa **06** và **07** (hai thân form dùng `PrimaryButton` làm nút gửi).
