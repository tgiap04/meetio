---
phase: 04
title: "Màn Splash + cổng khởi động"
status: completed
priority: P1
effort: 2h
blockedBy: [01, 02]
blocks: [08]
completed: 2026-09-18
---

# Phase 04 — Màn Splash + cổng khởi động

**Liên kết:** [plan.md](plan.md) · **[decisions §1 (splash là component, không phải route)](decisions.md)** ·
[file-ownership.md](file-ownership.md) · [design.png](../../design.png) màn 1 ·
file sẽ sửa: `app/_layout.tsx`

## Tổng quan

Màn 1 của design, **và** cơ chế chống nháy sai màn. Hai việc này là một: splash chính là thứ app
hiển thị trong lúc state đang hydrate, nên không có khoảnh khắc nào route con kịp mount và bắn
redirect sai.

## Nhận định then chốt

- `app/_layout.tsx` **đã** giữ app lại bằng `<LoadingState label="Đang khởi động…" />` khi
  `authStatus === 'hydrating'`. Phase này chỉ thay nội dung cổng và thêm hai điều kiện — **không**
  phát minh cơ chế mới.
- Ba điều kiện chạy **song song**, thời gian tổng là `max(...)`:

  | Điều kiện | Nguồn |
  |---|---|
  | `authStatus !== 'hydrating'` | `useHydrateSession()` — đã có |
  | `preferences.status === 'ready'` | `useHydratePreferences()` — phase 02 |
  | `minimumElapsed` | `useMinimumSplashDelay(900)` — phase này |

- **Vì sao có mốc 900 ms:** không có nó, hydrate xong trong ~40 ms và splash thành một cú nháy — tệ
  hơn là không có splash. Vì chạy song song nên nó **không** cộng thêm vào thời gian khởi động khi
  hydrate chậm hơn 900 ms.
- Design màn 1 có **ba chấm với chấm đầu là viên thuốc dài** — dùng lại `PagerDots` của phase 01
  (`count=3, activeIndex=0`). Đây là chấm trang trí, không điều hướng gì.
- Splash **không** render `<Slot />`. Route con chỉ tồn tại sau khi cổng mở. Đó là toàn bộ cơ chế
  chống nháy.

## Yêu cầu

**Chức năng**

1. `<AppSplash />` — nền `colors.surface`; 2 `<Blob>` (trên-phải, dưới-trái) tuyệt đối, cha
   `overflow: 'hidden'`; giữa màn `<AppMark size={88} />`, chữ `Meetio` kiểu `typography.display`
   màu `colors.text`, tagline 2 dòng kiểu `typography.body` màu `colors.textMuted`; dưới cùng
   `<PagerDots count={3} activeIndex={0} />`.
2. `useMinimumSplashDelay(ms: number): boolean` — `false` → `true` sau `ms`, dọn timer khi unmount.
3. `app/_layout.tsx` gắn thêm `useHydratePreferences()`, tính `isBooting` từ ba điều kiện, render
   `<AppSplash />` khi còn booting, `<Slot />` khi xong.

**Chuỗi (nguyên văn design):**

| Chỗ | Chuỗi |
|---|---|
| Wordmark | `Meetio` |
| Tagline | `Ghi âm mọi cuộc họp,\nbiến lời nói thành tri thức.` |

**Phi chức năng**

- `<AppSplash />` phải render được **không cần** provider nào (không Query, không router) — điều kiện
  để test nó trần.
- `app/_layout.tsx` giữ dưới 40 dòng.

## Kiến trúc

```
app/_layout.tsx
├── QueryClientProvider                     (giữ nguyên)
├── useHydrateSession()        ──► session.authStatus
├── useHydratePreferences()    ──► preferences.status        (mới, phase 02)
├── useMinimumSplashDelay(900) ──► minimumElapsed            (mới)
│
└── isBooting = authStatus === 'hydrating'
              || preferencesStatus !== 'ready'
              || !minimumElapsed
      ├── true  → <AppSplash />     ← KHÔNG route nào mount ⇒ không guard nào chạy
      └── false → <Slot />          → app/index.tsx (phase 05) quyết định đích
```

`<LoadingState />` **vẫn giữ nguyên trong repo** — các màn khác (`(app)/index.tsx`,
`settings.tsx`) đang dùng cho trạng thái tải dữ liệu. Chỉ chỗ dùng ở root layout bị thay.

## File liên quan

**Tạo:** `src/components/splash/app-splash.tsx` + `.test.tsx` ·
`src/hooks/use-minimum-splash-delay.ts` + `.test.ts` · `src/navigation/root-layout-boot-gate.test.tsx`.
**Sửa:** `app/_layout.tsx`.
**Xoá:** không (giữ `LoadingState`).

## Các bước

1. `use-minimum-splash-delay.ts` + test (`jest.useFakeTimers()`: chưa tới hạn → `false`; qua hạn →
   `true`; unmount trước hạn → không setState, không cảnh báo).
2. `app-splash.tsx`, lắp từ `AppMark` / `Blob` / `PagerDots` của phase 01. `testID="app-splash"`.
3. `app-splash.test.tsx`: render trần; khẳng định có wordmark `Meetio`, có **đúng** hai dòng tagline,
   `PagerDots` nhận `activeIndex === 0`.
4. Sửa `app/_layout.tsx`: thêm hook, đổi biểu thức cổng, đổi `LoadingState` → `AppSplash`. Giữ
   nguyên `QueryClientProvider` và `wireQueryClientToAppState()`.
5. `root-layout-boot-gate.test.tsx` theo khuôn `app-group-layout.test.tsx`:
   `jest.mock('expo-router', () => ({ Slot: … }))`, mock cả hai store, mock hai hook hydrate, dùng
   fake timers. Ma trận: mỗi điều kiện **một mình** chưa xong → vẫn splash; cả ba xong → `Slot`.
6. lint + typecheck + test.

## Todo

- [x] `use-minimum-splash-delay.ts` + test (fake timers)
- [x] `app-splash.tsx`
- [x] `app-splash.test.tsx`
- [x] sửa `app/_layout.tsx` (3 điều kiện)
- [x] `root-layout-boot-gate.test.tsx` (4 case)
- [x] lint + typecheck + test xanh

## Chuẩn hoàn thành (đo được)

| Tiêu chí | Cách kiểm |
|---|---|
| Còn `authStatus === 'hydrating'` → render `AppSplash`, **không** render `Slot` | `root-layout-boot-gate.test.tsx` |
| Còn `preferences.status === 'hydrating'` → vẫn `AppSplash` | cùng file |
| Chưa qua 900 ms → vẫn `AppSplash` dù hai cái kia xong | cùng file, fake timers |
| Cả ba xong → render `Slot` đúng một lần | cùng file |
| `AppSplash` render được không cần provider | `app-splash.test.tsx` không bọc provider nào |
| Tagline đúng nguyên văn design | assertion so chuỗi chính xác |
| Chuỗi tiếng Việt hợp lệ để render bằng font hệ thống | `isRenderableVietnameseText(tagline) === true` |
| `app/_layout.tsx` < 40 dòng | `wc -l apps/mobile/app/_layout.tsx` |
| Không file test nào nằm dưới `app/` | job CI `assert-no-tests-in-expo-router-app-dir` |

## Rủi ro

| Rủi ro | K × T | Đối sách |
|---|---|---|
| Thêm một điều kiện cổng nhưng quên ⇒ nháy sai màn quay lại | Trung × Trung | Cổng là **một** biểu thức ở **một** file; test phủ từng điều kiện riêng lẻ |
| Timer 900 ms gây rò state sau unmount (cảnh báo React) | Trung × Thấp | Hook dọn timer; test có case unmount sớm |
| 900 ms bị cảm nhận là chậm | Thấp × Thấp | Một hằng số ở một chỗ; QA phase 08 định lại nếu thấy lê thê |
| Native splash (trước khi JS chạy) nhảy màu sang splash của ta | Trung × Thấp | Ghi nhận ở QA phase 08. Cấu hình native splash **ngoài phạm vi** vì `assets/splash-icon.png` vẫn là ảnh mẫu Expo ([decisions §5](decisions.md)) |

**Rollback:** `git revert` commit của phase. `app/_layout.tsx` trở về cổng một điều kiện với
`LoadingState`; không dữ liệu nào phải hoàn tác.

## An toàn / bảo mật

Không có bề mặt mới. Cần giữ đúng một điều: cổng khởi động **không được** hiện bất kỳ nội dung nào
của người dùng trước khi auth ngã ngũ — `AppSplash` thuần tĩnh, không đọc profile, không gọi mạng.

## Tiếp theo

Chạy song song với phase 05 (khác file). Cả hai xong thì phase 06/07 mới có chỗ để đổ vào.
