---
phase: 07
title: "Màn quyền Microphone"
status: completed
priority: P1
effort: 2.5h
blockedBy: [01, 02, 03, 05]
blocks: [08]
completed: 2026-09-18
---

# Phase 07 — Màn quyền Microphone

**Liên kết:** [plan.md](plan.md) · **[decisions §4 (hộp thoại chỉ mở một lần)](decisions.md)** ·
[file-ownership.md](file-ownership.md) · [design.png](../../design.png) màn 3 ·
[user_stories.md](../../user_stories.md) **US-07** · phase 03 (API quyền)

## Tổng quan

Màn 3 của design, gọi **API quyền thật** của hệ điều hành. Việc khó ở đây không phải vẽ, mà là
**đường thoát khi bị từ chối** — trên iOS hộp thoại hệ thống chỉ mở đúng một lần trong đời app.

## Nhận định then chốt

- Nếu màn này chỉ có nút "Cho phép", thì trên iOS sau một lần từ chối nó là **nút chết**: bấm mãi
  không có gì xảy ra, không báo gì. AC của **US-07** viết thẳng — *"bị từ chối thì hiển thị hướng dẫn
  mở phần Cài đặt hệ thống thay vì báo lỗi trống"*. Nên `blocked` là yêu cầu, không phải trang trí.
- Màn này trả lời **một** câu duy nhất: *đã hỏi chưa*. Câu *đã có quyền chưa* thuộc lúc bấm ghi âm
  (Phase 07 của kế hoạch tổng). Nhờ tách vậy, người thu hồi quyền trong Cài đặt hệ thống **không bao
  giờ** bị ném ngược về màn này, và không có vòng lặp Home ↔ permission.
- **Cả ba lối ra đều ghi `mic_prompt_seen = true`** rồi `replace(ROOT_ROUTE)`: cho phép, từ chối, để
  sau. Không lối nào để cờ nguyên — nếu không, mở app lần sau lại rơi vào đây.
- **Mũi tên back** ở góc trái (design) dùng **chung handler** với "Không, để sau": màn này tới bằng
  redirect nên không có history để `back()` về; một nút back thật sẽ là ngõ cụt.
- Màn hình **không** import `expo-audio` — chỉ import từ `src/permissions/microphone-permission.ts`
  của phase 03. Đó là thứ cho phép test màn hình mà không đụng gì tới native.

## Yêu cầu

**Chức năng**

1. `src/hooks/use-microphone-permission.ts`:
   ```ts
   export function useMicrophonePermission(): {
     view: MicPermissionView;      // 'ask' | 'blocked' | 'granted'
     isBusy: boolean;
     onPrimaryPress: () => Promise<void>;
     onDefer: () => void;
   };
   ```
   - Lúc mount: `readMicrophonePermission()` → `resolveMicPermissionView` → `view`.
     Nếu ra `'granted'` ngay → ghi cờ + `replace` luôn, không bắt người dùng bấm gì.
   - `onPrimaryPress` khi `view === 'ask'`: `requestMicrophonePermission()` → tính lại `view`.
     `granted` → ghi cờ + `replace`. `blocked` → **ở lại**, đổi giao diện sang `blocked`.
     Vẫn `ask` (Android từ chối lần 1) → ở lại, người dùng bấm lại được.
   - `onPrimaryPress` khi `view === 'blocked'`: `openAppSettings()` **rồi** ghi cờ + `replace`.
   - `onDefer`: ghi cờ + `replace`.
2. `src/components/permission/permission-body.tsx` — phần trình bày thuần, nhận `view` + 2 handler,
   không biết gì về native.
3. `app/(app)/permission.tsx` — lắp hook + body + nút back.

**Chuỗi (nguyên văn design, trừ dòng `blocked` do US-07 đòi):**

| Chỗ | Chuỗi |
|---|---|
| Tiêu đề | `Cần quyền truy cập\nMicrophone` |
| Thân bài | `Meetio cần quyền truy cập microphone để có thể ghi âm và nhận diện giọng nói.` |
| Nút chính — `ask` | `Cho phép` |
| Nút chính — `blocked` | `Mở Cài đặt` |
| Dòng thêm khi `blocked` | `Bạn đã từ chối quyền microphone. Mở Cài đặt hệ thống để bật lại trước khi ghi âm.` |
| Link chữ | `Không, để sau` |

**Phi chức năng**

- "Không, để sau" dùng `colors.primaryStrong` ([decisions §8](decisions.md)).
- `app/(app)/permission.tsx` < 80 dòng; `permission-body.tsx` < 120 dòng.
- Nút back có `accessibilityRole="button"` + `accessibilityLabel="Bỏ qua, để sau"` — nói đúng việc
  nó làm, vì nó không back thật.
- `isBusy` khoá nút trong lúc chờ hộp thoại hệ thống (`PrimaryButton` đã hỗ trợ `loading`).

## Kiến trúc

```
app/index.tsx  ──(#7: đã auth, chưa hỏi mic)──►  app/(app)/permission.tsx
                                                   │  guard (app) đã chặn: chưa auth thì không vào được
                                                   ▼
                                          useMicrophonePermission()
                                                   │
      mount ──► readMicrophonePermission() ──► resolveMicPermissionView()
                                                   │
        ┌──────────────┬───────────────────────────┴──────────────┐
        ▼              ▼                                          ▼
    'granted'        'ask'                                   'blocked'
  ghi cờ+replace   nút "Cho phép"                          nút "Mở Cài đặt"
                     │                                          │
              requestMicrophonePermission()               openAppSettings()
                     │                                          │
          ┌──────────┼───────────┐                        ghi cờ + replace
          ▼          ▼           ▼
      'granted'   'blocked'    'ask'
   ghi cờ+replace  đổi view   ở lại, bấm lại được
                   (iOS: rơi vào đây sau lần từ chối đầu)

"Không, để sau" / mũi tên back  ──►  ghi cờ + replace   (từ bất kỳ view nào)
```

**Ghi cờ + replace** luôn theo đúng thứ tự của [decisions §3](decisions.md):
`markMicPromptSeen()` (đồng bộ) → ghi ngầm, nuốt lỗi → `router.replace(ROOT_ROUTE)`.

## File liên quan

**Tạo:** `app/(app)/permission.tsx` · `src/components/permission/permission-body.tsx` + `.test.tsx` ·
`src/hooks/use-microphone-permission.ts` · `src/navigation/permission-screen.test.tsx`.
**Sửa:** không. **Xoá:** không.

## Các bước

1. `permission-body.tsx` trước (thuần trình bày, test không cần mock native).
2. `permission-body.test.tsx`: `view='ask'` → nhãn `Cho phép`, **không** có dòng giải thích ·
   `view='blocked'` → nhãn `Mở Cài đặt` **và** có dòng giải thích · cả hai đều có link "Không, để sau".
3. `use-microphone-permission.ts`.
4. `app/(app)/permission.tsx`.
5. `permission-screen.test.tsx` — mock `expo-router` (`router.replace`),
   `src/permissions/microphone-permission` (cả 4 hàm) và `usePreferencesStore`. Ma trận:

   | # | mount trả về | thao tác | request trả về | kỳ vọng |
   |---|---|---|---|---|
   | 1 | granted | — | — | `markMicPromptSeen` + `replace('/')`, **không** gọi `request` |
   | 2 | ask | bấm chính | granted | `request` gọi 1 lần, rồi cờ + `replace('/')` |
   | 3 | ask | bấm chính | blocked (iOS từ chối) | **không** `replace`; nhãn đổi thành `Mở Cài đặt` |
   | 4 | blocked (sau #3) | bấm chính | — | `openAppSettings` 1 lần, rồi cờ + `replace('/')` |
   | 5 | ask | bấm chính | ask (Android từ chối lần 1) | ở lại view `ask`, bấm lại gọi `request` lần 2 |
   | 6 | ask | "Không, để sau" | — | cờ + `replace('/')`, **không** gọi `request` |
   | 7 | ask | mũi tên back | — | giống hệt #6 |

6. lint + typecheck + test.

## Todo

- [x] `permission-body.tsx` (3 view)
- [x] `permission-body.test.tsx`
- [x] `use-microphone-permission.ts`
- [x] `app/(app)/permission.tsx` (< 80 dòng)
- [x] `permission-screen.test.tsx` (7 case)
- [x] "Không, để sau" dùng `primaryStrong`
- [x] back = cùng handler với "để sau", có `accessibilityLabel` đúng
- [x] lint + typecheck + test xanh

## Chuẩn hoàn thành (đo được)

| Tiêu chí | Cách kiểm |
|---|---|
| Đã cấp quyền sẵn → không hỏi lại, đi thẳng | case #1 |
| iOS bị chặn → nút đổi thành "Mở Cài đặt", **không** gọi `request` nữa | case #3, #4 |
| Android từ chối lần 1 → vẫn bấm lại được | case #5 |
| Cả 3 lối ra đều đặt `mic_prompt_seen` | case #2, #4, #6 |
| Mọi lối ra `replace('/')`, không phải `/(app)` | `expect(replace).toHaveBeenCalledWith('/')` |
| Màn hình không import `expo-audio` | `grep -rn "expo-audio" apps/mobile/app/` rỗng |
| Chuỗi tiếng Việt render được bằng font hệ thống | `isRenderableVietnameseText` trên 6 chuỗi |
| `app/(app)/permission.tsx` < 80 dòng | `wc -l` |
| Không file test dưới `app/` | job CI |
| Số test tăng ≥ 12 | |

## Rủi ro

| Rủi ro | K × T | Đối sách |
|---|---|---|
| iOS chỉ mở hộp thoại một lần ⇒ người dùng kẹt ở nút chết | Cao × Cao | View `blocked` + `openAppSettings`; case #3/#4 khoá bằng test. **Kiểm tay trên máy thật** ở phase 08 (simulator có thể khác) |
| `openAppSettings` mở nhầm trang gốc Cài đặt thay vì trang app | Thấp × Trung | QA tay phase 08 trên cả iOS lẫn Android |
| Ghi cờ trước khi hộp thoại kịp trả lời ⇒ mất luôn cơ hội hỏi | Thấp × Cao | Chỉ ghi cờ **sau** khi `request` resolve, hoặc khi người dùng chủ động hoãn — không bao giờ ghi lúc mount ở view `ask` |
| Bấm "Cho phép" hai lần liên tiếp ⇒ hai hộp thoại | Trung × Thấp | `isBusy` khoá nút suốt lúc chờ; test case #5 bấm lại chỉ sau khi resolve |
| Người dùng thu hồi quyền trong Cài đặt sau này ⇒ tưởng phải quay lại màn này | Trung × Trung | Cố ý **không** quay lại. Kiểm quyền lúc ghi âm là việc của Phase 07 kế hoạch tổng; ghi rõ trong hand-back |

**Rollback:** `git revert`. Cờ `mic_prompt_seen` đã đặt thì vẫn còn — vô hại, vì route biến mất cùng
lúc với nhánh trỏ tới nó trong `resolveBootstrapRoute`.

## An toàn / bảo mật

1. **Quyền hệ điều hành ≠ đồng ý pháp lý.** Màn `(app)/consent.tsx` (US-04) vẫn là cổng pháp lý
   riêng và **không** bị màn này thay thế hay bỏ qua. Hai thứ tồn tại song song, đúng như hiện trạng.
2. Từ chối quyền **không** chặn người dùng dùng app — họ vào Home bình thường. Nút "Bắt đầu" ở Home
   đã có cổng consent riêng; cổng quyền micro sẽ do Phase 07 kế hoạch tổng bổ sung tại chỗ ghi âm.
3. Phase này **không** mở `AudioSession`, **không** thu một mẫu âm thanh nào. Chỉ hỏi quyền.

## Tiếp theo

Phase 08: prebuild native, `grep` Info.plist / AndroidManifest, và QA tay trên **máy thật** — vì hành
vi "chỉ hỏi một lần" của iOS không kiểm được bằng Jest.
