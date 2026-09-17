---
phase: 03
title: "expo-audio + cấu hình quyền native"
status: completed
priority: P1
effort: 1.5h
blockedBy: []
blocks: [07, 08]
completed: 2026-09-18
---

# Phase 03 — `expo-audio` + cấu hình quyền native

**Liên kết:** [plan.md](plan.md) · **[decisions §4 (hộp thoại chỉ mở một lần)](decisions.md)** ·
[file-ownership.md](file-ownership.md) · [user_stories.md](../../user_stories.md) US-07 ·
`Makefile` mục `build-app` / `app-verify` / `app-clean`

## Tổng quan

Thêm dependency native, cấu hình quyền trong `app.json`, và bọc API quyền lại thành một module nhỏ
của `src/` để màn hình ở phase 07 không phải chạm trực tiếp vào `expo-audio`. **Không** dựng native
ở phase này — việc đó dồn về phase 08 để chỉ prebuild **một** lần cho cả kế hoạch.

## Nhận định then chốt

API dưới đây đã **xác minh trên nguồn `expo/expo` nhánh `sdk-57`**, không phải trí nhớ:

- Hàm quyền là **export tên ở cấp cao nhất**: `requestRecordingPermissionsAsync()` và
  `getRecordingPermissionsAsync()`. `AudioModule` cũng có chúng nhưng được đánh dấu `@hidden` →
  **dùng export cấp cao nhất**.
- Trả về `{ status: 'granted'|'denied'|'undetermined', granted, canAskAgain, expires: 'never' }`.
- Config plugin: khóa đúng là **`microphonePermission`** (không phải `microphonePermissionText`), đặt
  `NSMicrophoneUsageDescription`.
- Plugin **tự thêm** `android.permission.RECORD_AUDIO` vào AndroidManifest (tuỳ chọn
  `recordAudioAndroid`, mặc định `true`) và **luôn** thêm `MODIFY_AUDIO_SETTINGS`. **Không** cần khai
  tay trong `android.permissions` của `app.json` — khai thêm chỉ tạo hai nguồn sự thật.
- `jest-expo@57` **đã tự mock** module native `ExpoAudio` (xác nhận trong
  `jest-expo/src/preset/moduleMocks/expoModules.js`), nên import `expo-audio` trong test **không**
  ném `NativeModule is null` như `expo-secure-store` từng ném. ⇒ **không sửa `jest.setup.ts`**.
  Cái bẫy còn lại: auto-mock trả `undefined`, nên test nào cần `PermissionResponse` thật phải tự
  `jest.mock('expo-audio', ...)` — đã tính trong test của phase này.
- `expo-audio@57.0.5` là bản 57.x mới nhất; `expo install` trên SDK 57 cũng ra đúng bản đó.
- `enableBackgroundRecording` để **mặc định `false`**. Ghi âm nền là phạm vi Phase 07 của kế hoạch
  tổng; bật sớm là kéo thêm service + quyền vào manifest mà không ai dùng (YAGNI).

## Yêu cầu

**Chức năng**

1. `expo-audio@~57.0.5` vào `apps/mobile/package.json`.
2. `app.json` → `plugins` thêm `["expo-audio", { "microphonePermission": "<chuỗi tiếng Việt>" }]`.
3. `src/permissions/microphone-permission.ts` export:
   ```ts
   export type MicPermissionView = 'ask' | 'blocked' | 'granted';
   export interface MicPermissionSnapshot { granted: boolean; canAskAgain: boolean }

   export function resolveMicPermissionView(s: MicPermissionSnapshot): MicPermissionView; // thuần
   export function readMicrophonePermission(): Promise<MicPermissionSnapshot>;
   export function requestMicrophonePermission(): Promise<MicPermissionSnapshot>;
   export function openAppSettings(): Promise<void>;
   ```

**Chuỗi `NSMicrophoneUsageDescription` (tiếng Việt, chốt):**

> `Meetio cần quyền truy cập microphone để ghi âm cuộc họp và chuyển giọng nói thành văn bản.`

Apple đòi chuỗi mục đích **cụ thể** — nói rõ ghi cái gì và để làm gì. Chuỗi này khớp với thân bài
trên màn hình ở phase 07, nên người dùng đọc hai lần cùng một lời hứa.

**Phi chức năng**

- `openAppSettings` lấy từ **`expo-linking`** (đã là dependency), **không** từ `react-native` — giữ
  một đường import Linking duy nhất trong app.
- `resolveMicPermissionView` là **hàm thuần, không import gì** — test nó không cần mock.

## Kiến trúc

```
app/(app)/permission.tsx  (phase 07)
        │  chỉ import từ src/permissions/*
        ▼
src/permissions/microphone-permission.ts
        ├── requestMicrophonePermission() ──► expo-audio.requestRecordingPermissionsAsync()
        ├── readMicrophonePermission()    ──► expo-audio.getRecordingPermissionsAsync()
        ├── openAppSettings()             ──► expo-linking.openSettings()
        └── resolveMicPermissionView()     ← thuần, 0 import

app.json  ──(expo prebuild, phase 08)──►  ios/Meetio/Info.plist   : NSMicrophoneUsageDescription
                                          android/…/AndroidManifest.xml : RECORD_AUDIO
```

**Bảng trạng thái** (nguồn sự thật cho `resolveMicPermissionView`):

| `granted` | `canAskAgain` | → view |
|---|---|---|
| true | bất kỳ | `granted` |
| false | true | `ask` |
| false | false | `blocked` |

## File liên quan

**Tạo:** `src/permissions/microphone-permission.ts` + `.test.ts`.
**Sửa:** `apps/mobile/package.json`, `app.json`, `yarn.lock` (do `yarn install` sinh).
**Xoá:** không. **Không đụng:** `jest.setup.ts` (xem Nhận định).

## Các bước

1. `cd apps/mobile && yarn add expo-audio@~57.0.5` (hoặc `npx expo install expo-audio`). Xác nhận
   `package.json` ghi `~57.0.5`, `yarn.lock` cập nhật.
2. `app.json` → `plugins`: `"expo-router"` giữ nguyên, thêm mục mảng cho `expo-audio` với
   `microphonePermission` là chuỗi trên. **Không** thêm `android.permissions` bằng tay.
3. `microphone-permission.ts`: `resolveMicPermissionView` trước (thuần), rồi 3 hàm bọc. Mỗi hàm bọc
   quy `PermissionResponse` về `MicPermissionSnapshot` — màn hình không bao giờ thấy kiểu của
   `expo-audio`, nên đổi thư viện sau này chỉ sửa một file.
4. `microphone-permission.test.ts`:
   - `resolveMicPermissionView` — 4 case của bảng trạng thái, **không mock gì**;
   - `requestMicrophonePermission` / `readMicrophonePermission` — `jest.mock('expo-audio', ...)` trả
     `PermissionResponse` đủ trường, khẳng định đã quy đúng về snapshot;
   - `openAppSettings` — `jest.mock('expo-linking', ...)`, khẳng định gọi đúng một lần.
5. `yarn workspace @meetio/mobile test` — phải xanh **mà không cần** sửa `jest.setup.ts`. Nếu đỏ vì
   `NativeModule`, ghi lại lỗi thật rồi mới thêm mock vào `jest.setup.ts` (đường lùi, xem Rủi ro).
6. `yarn lint && yarn typecheck`.

> **Không chạy `make build-app` ở phase này.** Prebuild dồn về phase 08, một lần cho cả kế hoạch.

## Todo

- [x] `yarn add expo-audio@~57.0.5`
- [x] `app.json`: plugin + `microphonePermission` tiếng Việt
- [x] `microphone-permission.ts` (1 hàm thuần + 3 hàm bọc)
- [x] `microphone-permission.test.ts` (4 case thuần + 3 case có mock)
- [x] test xanh **không** đụng `jest.setup.ts`
- [x] lint + typecheck xanh

## Chuẩn hoàn thành (đo được)

| Tiêu chí | Cách kiểm |
|---|---|
| Ghim đúng bản | `node -p "require('./apps/mobile/package.json').dependencies['expo-audio']"` → `~57.0.5` |
| Plugin có mặt với khóa đúng | `node -p "JSON.stringify(require('./apps/mobile/app.json').expo.plugins)"` chứa `expo-audio` và `microphonePermission` |
| Không khai tay quyền Android | `node -p "require('./apps/mobile/app.json').expo.android.permissions"` → `undefined` |
| 4 nhánh của `resolveMicPermissionView` đều có test | đọc file test |
| Màn hình không thấy kiểu của `expo-audio` | `grep -rn "expo-audio" apps/mobile/app/` rỗng (kiểm lại ở phase 07) |
| `openSettings` lấy từ `expo-linking`, không từ `react-native` | `grep -n "from 'react-native'" src/permissions/microphone-permission.ts` rỗng |
| `jest.setup.ts` không đổi | `git diff apps/mobile/jest.setup.ts` rỗng |
| `yarn test` xanh | |

## Rủi ro

| Rủi ro | K × T | Đối sách |
|---|---|---|
| Khóa plugin sai tên ⇒ `NSMicrophoneUsageDescription` vắng ⇒ **crash ngay khi xin quyền** trên iOS | Trung × Cao | Đã xác minh khóa trên `plugin/src/withAudio.ts` nhánh `sdk-57`; phase 08 `grep` Info.plist là **tiêu chí bắt buộc**, không phải hy vọng |
| `jest-expo` **không** auto-mock `ExpoAudio` như dự đoán ⇒ cả suite đỏ | Thấp × Trung | Đường lùi đã định sẵn: thêm mock `expo-audio` vào `jest.setup.ts` trong **chính phase này**, để giữa các phase suite không bao giờ đỏ |
| Thêm dependency native làm `expo-doctor` kêu lệch phiên bản | Thấp × Thấp | `make app-doctor` ở phase 08; `~57.0.5` khớp SDK 57 đã kiểm trên npm |
| `MODIFY_AUDIO_SETTINGS` xuất hiện trong manifest ngoài dự kiến | Cao × Rất thấp | Plugin luôn thêm; ghi nhận ở đây để reviewer không tưởng là lỗi |

**Rollback:** gỡ dòng dependency + mục plugin, `yarn install`, rồi `make build-app` để native trở
lại. Không có migration dữ liệu nào để hoàn tác.

## An toàn / bảo mật

Quyền microphone là quyền **nhạy cảm**. Ba điều buộc phải giữ:

1. Chuỗi mục đích nói đúng sự thật app làm — ghi âm cuộc họp, chuyển thành văn bản. Không hứa thừa.
2. Phase này **không** ghi âm, **không** bật `AudioSession`, **không** đặt
   `enableBackgroundRecording`. Chỉ hỏi quyền.
3. Đồng ý ghi âm về mặt **pháp lý** là màn `(app)/consent.tsx` đã có (US-04) — khác hẳn quyền của hệ
   điều hành. Hai thứ không được trộn, và phase này không đụng vào màn consent.

## Tiếp theo

Mở khoá phase 07 (màn hình tiêu thụ 4 hàm export) và phase 08 (prebuild + `grep` native).
