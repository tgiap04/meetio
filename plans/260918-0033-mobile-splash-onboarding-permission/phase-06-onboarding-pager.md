---
phase: 06
title: "Onboarding 3 trang"
status: completed
priority: P1
effort: 2.5h
blockedBy: [01, 02, 05]
blocks: [08]
completed: 2026-09-18
---

# Phase 06 — Onboarding 3 trang

**Liên kết:** [plan.md](plan.md) · **[decisions §6 (nút "Bắt đầu" lật trang)](decisions.md)** ·
**[decisions §7 (nội dung ba trang)](decisions.md)** · [file-ownership.md](file-ownership.md) ·
[design.png](../../design.png) màn 2 · [user_stories.md](../../user_stories.md) E3, E6

## Tổng quan

Màn 2 của design, nhân thành pager 3 trang. Trang 1 nguyên văn design; trang 2 và 3 lấy đề tài từ
spec đã viết (E3, E6), **không bịa tính năng**.

## Nhận định then chốt

- Design vẽ **ba chấm** nhưng chỉ dựng trang 1 — ba trang là quyết định đã chốt, không phải suy đoán.
- Nút "Bắt đầu" **lật trang** ở trang 1–2, **kết thúc** ở trang 3. Nếu để nó kết thúc luôn từ trang 1
  thì trang 2 và 3 chỉ tới được bằng vuốt và gần như không ai thấy — dựng ba trang rồi giấu mất hai
  ([decisions §6](decisions.md)).
- Thứ tự khi kết thúc **bắt buộc**: `markOnboardingCompleted()` (đặt state đồng bộ) **rồi mới**
  `router.replace(ROOT_ROUTE)`. Đảo lại thì `app/index.tsx` đọc cờ cũ và bắn ngược về `/onboarding`.
- Chữ "Meetio" in đậm giữa đoạn (design trang 1) → `<BrandedParagraph>` của phase 01, không tự xử lý.
- **Không** dùng `FlatList`: ba phần tử tĩnh, `ScrollView horizontal pagingEnabled` là đủ và đọc dễ
  hơn hẳn (KISS).

## Yêu cầu

**Chức năng**

1. `src/content/onboarding-pages.ts` — mảng đúng **3** phần tử, kiểu:
   ```ts
   export interface OnboardingPage { key: string; title: string; body: string }
   export const ONBOARDING_PAGES: readonly OnboardingPage[];
   ```
   `title` chứa `\n` để xuống đúng 2 dòng như design.
2. `src/components/onboarding/onboarding-page.tsx` — `<OnboardingPage page width />`: minh họa +
   tiêu đề (`typography.heading`, căn giữa, `colors.text`) + `<BrandedParagraph>` thân bài
   (`colors.textMuted`, căn giữa).
3. `src/hooks/use-complete-onboarding.ts` — trả về một hàm: `markOnboardingCompleted()` rồi
   `router.replace(ROOT_ROUTE)`.
4. `app/onboarding.tsx` — `ScrollView horizontal pagingEnabled`, state `pageIndex` từ
   `onMomentumScrollEnd`, `<PagerDots count={3} activeIndex={pageIndex} />`,
   `<PrimaryButton label="Bắt đầu" />`, link chữ "Bỏ qua".

**Nội dung (chốt):**

| # | `title` | `body` | Nguồn |
|---|---|---|---|
| 1 | `Ghi âm & Chuyển đổi\nthành văn bản` | `Meetio giúp bạn ghi âm cuộc họp từ bất kỳ nguồn âm thanh nào, chuyển giọng nói thành văn bản theo thời gian thực.` | design.png |
| 2 | `Dịch song song\nngay trong cuộc họp` | `Bật dịch và chọn ngôn ngữ đích, Meetio hiển thị bản dịch ngay dưới từng câu gốc và giữ lại để bạn xem lại sau cuộc họp.` | E3 · US-17,18,19 |
| 3 | `Đồ thị tri thức\n& Hỏi đáp có nguồn` | `Meetio rút ra người, dự án và chủ đề từ các cuộc họp, rồi trả lời câu hỏi của bạn kèm trích dẫn về đúng đoạn transcript.` | E6 · US-35,36,38 |

**Phi chức năng**

- "Bỏ qua" dùng `colors.primaryStrong` (chữ cam trên nền sáng — [decisions §8](decisions.md)),
  **không** `colors.primary`.
- Nền màn `colors.surface`. `app/onboarding.tsx` < 100 dòng.
- `accessibilityRole="button"` cho "Bỏ qua" (`PrimaryButton` đã tự có).

## Kiến trúc

```
app/onboarding.tsx
  ├─ state: pageIndex (0..2)
  ├─ ScrollView horizontal pagingEnabled
  │    └─ ONBOARDING_PAGES.map(p => <OnboardingPage page={p} width={screenWidth} />)
  │         └─ <OnboardingArt/>  <Text heading>  <BrandedParagraph/>      (phase 01)
  ├─ <PagerDots count={3} activeIndex={pageIndex}/>                        (phase 01)
  ├─ <PrimaryButton label="Bắt đầu" onPress={handlePrimary}/>
  └─ <Pressable> "Bỏ qua" onPress={complete}

handlePrimary:
  pageIndex < 2  → scrollTo(x = (pageIndex+1) * width)     (setState qua onMomentumScrollEnd)
  pageIndex === 2 → complete()

complete()  = useCompleteOnboarding()
  1. markOnboardingCompleted()        ← đặt state ĐỒNG BỘ (phase 02)
  2. writeOnboardingCompleted()       ← chạy ngầm, nuốt lỗi (bên trong store)
  3. router.replace(ROOT_ROUTE)       ← về bộ quyết định, KHÔNG về màn cụ thể
```

Nguồn sự thật của `pageIndex` là **`onMomentumScrollEnd`**, không phải state đặt lúc bấm nút — nhờ
vậy vuốt tay và bấm nút không bao giờ lệch nhau.

## File liên quan

**Tạo:** `app/onboarding.tsx` · `src/content/onboarding-pages.ts` + `.test.ts` ·
`src/components/onboarding/onboarding-page.tsx` + `.test.tsx` ·
`src/hooks/use-complete-onboarding.ts` · `src/navigation/onboarding-screen.test.tsx`.
**Sửa:** không. **Xoá:** không.

## Các bước

1. `onboarding-pages.ts` với đúng 3 mục theo bảng trên.
2. `onboarding-pages.test.ts`: đúng 3 mục · `key` không trùng · mỗi `title` có đúng một `\n` ·
   **mọi** `title`/`body` đều `isRenderableVietnameseText(...) === true` · `title` trang 1 khớp
   **nguyên văn** design · `body` trang 1 và 3 chứa `"Meetio"` (để `BrandedParagraph` có việc).
3. `onboarding-page.tsx` + test (render một trang, khẳng định tiêu đề và thân bài có mặt).
4. `use-complete-onboarding.ts`.
5. `app/onboarding.tsx`.
6. `onboarding-screen.test.tsx` (khuôn `app-group-layout.test.tsx`): mock `expo-router`
   (`router.replace`), mock `usePreferencesStore`.
   Case: bấm nút ở trang 0 → **không** gọi `replace`, `scrollTo` được gọi · giả lập
   `onMomentumScrollEnd` tới trang 2 rồi bấm → gọi `markOnboardingCompleted` **và**
   `replace('/')` · "Bỏ qua" ở trang 0 → cùng hai lời gọi đó · `replace` nhận đúng `'/'`, không phải
   `/(auth)/login`.
7. lint + typecheck + test.

## Todo

- [x] `onboarding-pages.ts` (3 trang)
- [x] `onboarding-pages.test.ts` (6 assertion gồm cả tiếng Việt)
- [x] `onboarding-page.tsx` + test
- [x] `use-complete-onboarding.ts`
- [x] `app/onboarding.tsx` (< 100 dòng)
- [x] `onboarding-screen.test.tsx` (4 case)
- [x] "Bỏ qua" dùng `primaryStrong`
- [x] lint + typecheck + test xanh

## Chuẩn hoàn thành (đo được)

| Tiêu chí | Cách kiểm |
|---|---|
| Đúng 3 trang, không hơn không kém | `expect(ONBOARDING_PAGES).toHaveLength(3)` |
| Tiêu đề trang 1 khớp nguyên văn design | so chuỗi chính xác |
| Mọi chuỗi render được bằng font hệ thống | `isRenderableVietnameseText` trên cả 6 chuỗi |
| Nút ở trang 0/1 lật trang, **không** kết thúc | `replace` không được gọi |
| Nút ở trang 2 kết thúc | `markOnboardingCompleted` + `replace('/')` |
| "Bỏ qua" kết thúc từ bất kỳ trang nào | test ở trang 0 |
| Mọi lối kết thúc điều hướng về `'/'` | `expect(replace).toHaveBeenCalledWith('/')` |
| Đặt cờ xảy ra **trước** điều hướng | thứ tự lời gọi mock (`invocationCallOrder`) |
| "Bỏ qua" dùng `primaryStrong` | `grep -n "colors.primary\b" apps/mobile/app/onboarding.tsx` rỗng |
| `app/onboarding.tsx` < 100 dòng | `wc -l` |
| Không file test dưới `app/` | job CI |

## Rủi ro

| Rủi ro | K × T | Đối sách |
|---|---|---|
| Đặt cờ **sau** điều hướng ⇒ `index` đọc cờ cũ, bắn ngược về onboarding | Trung × Cao | Thứ tự viết thành yêu cầu, và có test khoá thứ tự lời gọi |
| `onMomentumScrollEnd` không bắn trên một số thiết bị ⇒ chấm đứng yên | Thấp × Thấp | QA thị giác phase 08; đường lùi: thêm `onScroll` có throttle |
| Nhãn "Bắt đầu" ở trang 1 gây hiểu là bỏ qua luôn | Trung × Thấp | Quyết định đã ghi lý do; đổi nhãn theo trang là **một chuỗi** trong `onboarding-pages.ts` |
| Nội dung trang 2/3 hứa quá tay so với thứ sẽ ship | Trung × Trung | Cả hai đoạn chỉ mô tả AC đã viết trong E3/E6, có trích US kèm theo trong bảng nội dung |
| Chiều rộng trang lệch trên máy có notch / xoay màn | Thấp × Thấp | `width` lấy từ `useWindowDimensions()`, không hằng số cứng; app khoá `portrait` trong `app.json` |

**Rollback:** `git revert`. Cờ `onboarding_completed` của ai đã đặt thì vẫn còn — vô hại, vì route
biến mất cùng lúc với bộ định tuyến trỏ tới nó.

## An toàn / bảo mật

Onboarding nằm **ngoài** mọi guard và hiển thị **hoàn toàn nội dung tĩnh** — không đọc profile,
không gọi API, không chạm token. Đó là điều kiện để nó được phép sống ngoài guard.

## Tiếp theo

Chạy song song phase 07 (khác file hoàn toàn). Cả hai xong thì phase 08 dựng native và QA.
