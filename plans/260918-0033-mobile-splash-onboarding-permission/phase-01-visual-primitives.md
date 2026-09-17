---
phase: 01
title: "Nguyên thể thị giác"
status: completed
priority: P1
effort: 3h
blockedBy: []
blocks: [04, 06, 07]
completed: 2026-09-18
---

# Phase 01 — Nguyên thể thị giác

**Liên kết:** [plan.md](plan.md) · [decisions §5 (không dùng SVG)](decisions.md) ·
[decisions §8 (màu chữ)](decisions.md) · [file-ownership.md](file-ownership.md) ·
[design.png](../../design.png) màn 1–3

## Tổng quan

Dựng toàn bộ phần **nhìn** của ba màn thành component độc lập, không biết gì về routing, storage
hay quyền. Ba phase sau chỉ việc lắp. Đây là lý do 04/06/07 giữ được route file mỏng và mọi file
dưới 200 dòng.

## Nhận định then chốt

- Mọi hình trong ba màn là **tròn / chữ nhật bo góc / vòng khuyên / viên nhộng / cung tròn**.
  `borderRadius` + `borderWidth` + `transform: rotate` đủ hết. Không thêm thư viện vẽ (decisions §5).
- **Cung tròn bằng `View`:** `borderRadius: 999` + `borderWidth: n` + đặt `transparent` cho những
  cạnh không muốn thấy, rồi `rotate` để xoay cung về đúng hướng. Viết đúng **một lần** trong
  `<Arc />`, năm chỗ khác dùng lại (vòng đồng tâm màn 3, sóng âm hai bên mic, vòm trên của mic glyph).
- `PagerDots` dùng chung **cả splash lẫn onboarding** — design màn 1 cũng vẽ ba chấm với chấm đầu là
  viên thuốc dài. Đó là DRY thật, không phải gượng ép.
- Component **không tự đặt kích thước tuyệt đối**: nhận `size` (px) và suy mọi số đo theo tỉ lệ, để
  QA thị giác ở phase 08 chỉnh một số thay vì sửa chục style.

## Yêu cầu

**Chức năng**

1. `<Arc size arcSpan color thickness rotation />` — cung tròn.
2. `<Blob size variant />` — mảng peach hữu cơ (bo góc bất đối xứng), hai biến thể:
   `topRight`, `bottomLeft`. Nền `colors.primaryTint`.
3. `<AppMark size />` — ô vuông bo góc nền `colors.primary`, 5 vạch sóng trắng cao thấp khác nhau.
4. `<MicGlyph size color />` — thân viên nhộng + vòm dưới (Arc) + chân + đế.
5. `<OnboardingArt size />` — khung điện thoại + nút mic tròn cam lớn + 2 thẻ trắng có vạch chữ xám
   + 4 huy hiệu nhỏ quanh viền (màn 2).
6. `<MicPermissionArt size />` — vòng tròn cam lớn ôm `MicGlyph` trắng, 2–3 vòng peach đồng tâm phía
   sau, 2 cung sóng cam mỗi bên, thẻ trắng có dấu tick + 2 vạch chữ bên dưới (màn 3).
7. `<PagerDots count activeIndex />` — chấm hiện hành là viên thuốc dài `colors.primary`, chấm còn
   lại tròn `colors.border`.
8. `<BrandedParagraph text style />` — tách mọi lần xuất hiện của chuỗi `"Meetio"` thành `<Text>`
   đậm lồng trong đoạn, phần còn lại giữ nguyên.
9. `typography` thêm `display` (wordmark splash) và `heading` (tiêu đề 2 dòng của màn 2, 3).

**Phi chức năng**

- Mỗi file < 200 dòng (thực tế đều < 90).
- Không import `expo-router`, `zustand`, `expo-secure-store`, `expo-audio` — thuần trình bày.
- Mọi component nhận `testID` tuỳ chọn để phase sau khẳng định được sự có mặt.

## Kiến trúc

```
src/components/
├── illustrations/
│   ├── arc.tsx                  ← nguyên thể, 4 hình dưới dùng lại
│   ├── blob.tsx
│   ├── app-mark.tsx             → dùng ở splash
│   ├── mic-glyph.tsx            ← dùng trong 2 file dưới
│   ├── onboarding-art.tsx       → dùng ở onboarding trang 1
│   ├── mic-permission-art.tsx   → dùng ở màn quyền
│   └── illustrations.test.tsx
├── pager-dots.tsx               → splash + onboarding
└── branded-paragraph.tsx        → onboarding + màn quyền
```

Luồng dữ liệu: **một chiều, không state**. `props (size, color, index) → StyleSheet → View`.
Không component nào giữ state, gọi hook, hay chạm I/O.

## File liên quan

**Tạo:** 6 file `illustrations/*.tsx`, `illustrations/illustrations.test.tsx`, `pager-dots.tsx` +
test, `branded-paragraph.tsx` + test.
**Sửa:** `src/theme/typography.ts`, `src/theme/typography.test.ts`.
**Xoá:** không.

## Các bước

1. `arc.tsx` trước — mọi hình cong lệ thuộc nó. Ghi vào doc comment **kỹ thuật cung tròn bằng
   border trong suốt**, vì người đọc sau sẽ không tự đoán ra.
2. `typography.ts`: thêm `display: { fontFamily, fontSize: 40, fontWeight: '700' }` và
   `heading: { fontFamily, fontSize: 22, fontWeight: '700' }`. Giữ nguyên `title/body/caption/button`
   — đang có file khác dùng.
3. `typography.test.ts`: thêm case khẳng định `display`/`heading` có `fontFamily` và `fontWeight`
   đúng. **Không** đụng test `isRenderableVietnameseText` đã có.
4. `blob.tsx`, `app-mark.tsx` → splash dùng được.
5. `mic-glyph.tsx` → `onboarding-art.tsx`, `mic-permission-art.tsx`.
6. `pager-dots.tsx`, `branded-paragraph.tsx`.
7. `illustrations.test.tsx` gộp: mỗi component render ở 2 giá trị `size` khác nhau, khẳng định
   không ném lỗi và số node con đúng như kỳ vọng (ví dụ `AppMark` có đúng 5 vạch).
8. `yarn workspace @meetio/mobile test && yarn lint && yarn typecheck`.

## Todo

- [x] `arc.tsx` + doc comment kỹ thuật
- [x] `typography.ts` thêm `display`, `heading`
- [x] `typography.test.ts` thêm case token mới
- [x] `blob.tsx`
- [x] `app-mark.tsx` (5 vạch, chiều cao khác nhau)
- [x] `mic-glyph.tsx`
- [x] `onboarding-art.tsx`
- [x] `mic-permission-art.tsx`
- [x] `pager-dots.tsx` + test
- [x] `branded-paragraph.tsx` + test
- [x] `illustrations.test.tsx`
- [x] lint + typecheck + test xanh

## Chuẩn hoàn thành (đo được)

| Tiêu chí | Cách kiểm |
|---|---|
| 10 component export đúng tên trong bảng sở hữu file | `grep -r "export function" src/components/illustrations src/components/pager-dots.tsx src/components/branded-paragraph.tsx \| wc -l` ≥ 8 |
| `AppMark` render đúng 5 vạch sóng | assertion trong `illustrations.test.tsx` |
| `PagerDots(count=3, activeIndex=1)` → chấm 1 rộng hơn, hai chấm kia bằng nhau | `pager-dots.test.tsx` so `style.width` |
| `BrandedParagraph` in đậm **mọi** lần xuất hiện "Meetio", không đậm chữ khác | `branded-paragraph.test.tsx`: chuỗi 0 lần / 1 lần / 2 lần |
| Không file nào ≥ 200 dòng | `find src/components -name '*.tsx' -exec wc -l {} + \| awk '$1>=200'` không ra dòng nào |
| Không import routing/state/native | `grep -rE "expo-router\|zustand\|expo-secure-store\|expo-audio" src/components/illustrations src/components/pager-dots.tsx src/components/branded-paragraph.tsx` rỗng |
| `yarn test` xanh, số test tăng ≥ 10 | so với 39 test hiện có |

## Rủi ro

| Rủi ro | K × T | Đối sách |
|---|---|---|
| Cung tròn bằng border trong suốt render lệch trên Android | Trung × Thấp | `Arc` là **một** chỗ sửa; QA thị giác ở phase 08; đường lùi: thay ruột `Arc` bằng ảnh PNG cam kết |
| Minh họa "gần giống" nhưng sai tỉ lệ so với design | Trung × Thấp | Mọi số đo suy từ `size`; chỉnh một số ở phase 08 |
| `typography` thêm token mà không màn nào dùng | Thấp × Thấp | `display` dùng ở phase 04, `heading` ở 06 và 07 — cả hai đều có nơi tiêu thụ ngay trong kế hoạch này |

## An toàn / bảo mật

Không có bề mặt. Phase này không đọc ghi gì, không gọi mạng, không chạm quyền.

## Tiếp theo

Mở khoá phase 04 (cần `AppMark`, `PagerDots`, `typography.display`), 06 và 07.
