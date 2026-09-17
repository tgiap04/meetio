---
phase: 02
title: "Lưu cờ thiết bị"
status: completed
priority: P1
effort: 1.5h
blockedBy: []
blocks: [04, 05, 06, 07]
completed: 2026-09-18
---

# Phase 02 — Lưu cờ thiết bị

**Liên kết:** [plan.md](plan.md) · **[decisions §3 (vì sao secure-store, và chuyện cài lại app)](decisions.md)** ·
[file-ownership.md](file-ownership.md) · mẫu sẵn có: `src/storage/secure-store.ts`,
`src/store/session.store.ts`, `src/hooks/use-hydrate-session.ts`

## Tổng quan

Hai boolean cục bộ theo máy — `onboarding_completed`, `mic_prompt_seen` — cùng đường hydrate của
chúng. Dựng **song song** với `secure-store.ts` / `session.store.ts` / `use-hydrate-session.ts` đang
có, cùng hình dạng, để người đọc sau nhận ra ngay.

## Nhận định then chốt

- **Không thêm dependency.** `expo-secure-store` đã có, và `jest.setup.ts` đã mock sẵn nó — nên phase
  này **không phải đụng** file setup dùng chung. Lý do đầy đủ + bảng so sánh với AsyncStorage:
  [decisions §3](decisions.md).
- **Thứ tự ghi là hợp đồng, không phải chi tiết:** đặt state trong store **trước** (đồng bộ), rồi mới
  `await` việc ghi và **nuốt lỗi**. Đảo lại thì một Keychain treo = người dùng kẹt vĩnh viễn ở
  onboarding.
- **Đọc hỏng ⇒ `false` cả hai cờ.** Hiện thừa onboarding một lần thì phiền; giấu nhầm màn xin quyền
  thì người dùng không còn đường nào thấy lại.
- `status: 'hydrating' | 'ready'` là **điều kiện thứ hai** của cổng splash ở phase 04. Không có nó,
  `app/index.tsx` sẽ quyết định trên cờ `false` mặc định và bắn nhầm sang onboarding một nhịp.

## Yêu cầu

**Chức năng**

1. `readDevicePreferences(): Promise<DevicePreferences>` — đọc 2 khóa, map `'1'` → `true`, mọi giá
   trị khác (kể cả `null`, chuỗi rác) → `false`. **Không bao giờ ném.**
2. `writeOnboardingCompleted(): Promise<void>`, `writeMicPromptSeen(): Promise<void>` — ghi `'1'`.
3. `usePreferencesStore` (Zustand): `{ status, onboardingCompleted, micPromptSeen,
   finishHydration(prefs), markOnboardingCompleted(), markMicPromptSeen() }`.
4. `markOnboardingCompleted()` / `markMicPromptSeen()`: **set state trước**, rồi gọi hàm ghi tương
   ứng, `.catch(() => {})`.
5. `useHydratePreferences(): void` — chạy đúng một lần lúc mount, có cờ `cancelled` như
   `use-hydrate-session.ts`, `finishHydration` cả ở nhánh lỗi.

**Phi chức năng**

- Store **chỉ giữ state cục bộ theo máy** — đúng bất biến đã ghi trong `session.store.ts`: không bao
  giờ chứa dữ liệu từ API.
- Khóa mang tiền tố `meetio.` như khóa token sẵn có.

## Kiến trúc

```
app khởi động
  └─ useHydratePreferences()                    (phase 04 gắn vào app/_layout.tsx)
       └─ readDevicePreferences()
            └─ SecureStore.getItemAsync ×2  ──►  { onboardingCompleted, micPromptSeen }
                 │ (lỗi)                              │
                 └──────────► { false, false } ◄──────┘
                                    │
                        usePreferencesStore.finishHydration()
                                    │
                            status: 'hydrating' → 'ready'

người dùng bấm xong onboarding / xin quyền
  └─ markXxx()
       ├─ set({ xxx: true })                 ← đồng bộ, không thể hỏng
       └─ writeXxx().catch(() => {})         ← không await trước khi điều hướng
```

**Đường dữ liệu**, chữ ký cố định (phase khác import, không được đổi):

```ts
export interface DevicePreferences {
  onboardingCompleted: boolean;
  micPromptSeen: boolean;
}
export type PreferencesStatus = 'hydrating' | 'ready';
```

## File liên quan

**Tạo:** `src/storage/device-preferences.ts` + `.test.ts` · `src/store/preferences.store.ts` +
`.test.ts` · `src/hooks/use-hydrate-preferences.ts` + `.test.ts`.
**Sửa:** không. **Xoá:** không.

> `app/_layout.tsx` **không** thuộc phase này — phase 04 gắn hook vào đó.

## Các bước

1. `device-preferences.ts`: 2 hằng khóa, interface, 3 hàm. Bọc `readDevicePreferences` bằng
   `try/catch` trả về `{ false, false }`; ghi rõ trong doc comment **vì sao** fail-open.
2. `device-preferences.test.ts`: dùng mock `expo-secure-store` sẵn có trong `jest.setup.ts`
   (keychain trong bộ nhớ, có thật đường đọc/ghi). Case: chưa ghi gì → `{false,false}` · ghi rồi →
   `{true,...}` · giá trị rác `'0'`/`'true'` → `false` · `getItemAsync` ném → `{false,false}` không
   ném ra ngoài.
3. `preferences.store.ts` theo đúng khuôn `session.store.ts`, kèm doc comment nêu bất biến
   "chỉ state cục bộ".
4. `preferences.store.test.ts`: `status` khởi đầu `'hydrating'` · `finishHydration` → `'ready'` +
   giá trị đúng · `markOnboardingCompleted()` đặt state **ngay, đồng bộ** (khẳng định `getState()`
   ngay sau lời gọi, không `await`) · ghi hỏng vẫn không đổi state và không ném.
5. `use-hydrate-preferences.ts` + test (mount → `status` thành `'ready'`; unmount sớm không setState).
6. lint + typecheck + test.

## Todo

- [x] `device-preferences.ts` (3 hàm, fail-open khi đọc)
- [x] `device-preferences.test.ts` (5 case gồm cả nhánh ném)
- [x] `preferences.store.ts`
- [x] `preferences.store.test.ts` (có case khẳng định set **đồng bộ**)
- [x] `use-hydrate-preferences.ts` + test
- [x] lint + typecheck + test xanh

## Chuẩn hoàn thành (đo được)

| Tiêu chí | Cách kiểm |
|---|---|
| `readDevicePreferences` không ném khi storage lỗi | test mock `getItemAsync` ném → resolve `{false,false}` |
| Giá trị không phải `'1'` đều thành `false` | test với `'0'`, `'true'`, `''`, `null` |
| `markOnboardingCompleted` đổi state **trước** khi ghi xong | test khẳng định `usePreferencesStore.getState().onboardingCompleted === true` ngay sau lời gọi, không `await` |
| Ghi hỏng không ném ra ngoài, state vẫn `true` | test mock `setItemAsync` ném |
| `status` chỉ rời `'hydrating'` qua `finishHydration` | test |
| Không thêm dependency nào | `git diff apps/mobile/package.json` rỗng |
| Không đụng `jest.setup.ts` | `git diff apps/mobile/jest.setup.ts` rỗng |
| `yarn test` xanh, số test tăng ≥ 10 | |

## Rủi ro

| Rủi ro | K × T | Đối sách |
|---|---|---|
| Keychain iOS sống sót qua lần gỡ app ⇒ onboarding không hiện lại sau cài lại | Cao × Thấp | Đã chấp nhận và ghi rõ ([decisions §3](decisions.md)); app **đã** hành xử như vậy với token. Kiểm bằng tay ở phase 08 |
| Ghi hỏng âm thầm ⇒ onboarding hiện lại lần sau | Thấp × Thấp | Đúng hướng fail-open đã chọn; chấp nhận |
| Lẫn state cục bộ với dữ liệu server trong store | Thấp × Cao | Doc comment bất biến + review; store này không có bất kỳ import API nào |

## An toàn / bảo mật

Hai cờ này **không nhạy cảm** — dùng secure-store là vì tiện, không vì bí mật. Không ghi gì nhận
dạng người dùng vào đây; khi đăng xuất **không** xoá hai cờ (chúng thuộc về máy, không thuộc về
phiên) — đó là chủ ý, không phải bỏ sót.

## Tiếp theo

Mở khoá phase 04 (điều kiện `status === 'ready'` của cổng splash) và phase 05 (hai cờ cho bộ định
tuyến). Phase 06/07 dùng hai hàm `markXxx`.
