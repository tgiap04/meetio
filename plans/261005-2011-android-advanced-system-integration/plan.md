---
title: "Tích hợp sâu Android — khoá sinh trắc, shortcuts, widget, notification actions, tự dừng khi có cuộc gọi"
description: "Bốn tính năng Android nâng cao cho app mobile Expo, phục vụ báo cáo cuối kỳ môn Lập trình Android nâng cao, demo live trên máy thật."
status: in-progress
priority: P1
effort: 8.5d
branch: main
tags: [feature, frontend, android, native]
blockedBy: []
blocks: []
work_type: feature
spec_waived: "SDD mode disabled (takumi.sddMode: off)"
created: 2026-10-05
---

# Tích hợp sâu Android

## Overview

Bốn tính năng nhỏ, độc lập, mỗi cái chạm một thành phần hệ điều hành Android mà thầy thấy được khi
demo live: BiometricPrompt, ShortcutManager, AppWidgetProvider, PendingIntent/BroadcastReceiver trên
notification foreground service, AudioManager mode listener (Kotlin Expo Module).
Chủ đề báo cáo: **"Meetio tích hợp sâu vào hệ điều hành Android"**.

**Nguồn:** [Biên bản brainstorm](../reports/brainstorm-2026-10-05-android-advanced-features-for-final-grade.md) ·
[Nghiên cứu thư viện](../reports/researcher-2026-10-05-android-advanced-libs.md)

**Hạn:** 1–2 tuần. **Cắt bỏ theo thứ tự:** Phase 05 → Phase 04. Phase 01 và 06 **không cắt**.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Kiểm tra tương thích native (cổng chặn)](./phase-01-native-compat-spike.md) | ✅ Done — verified on device |
| 2 | [Khoá sinh trắc + App Shortcuts](./phase-02-biometric-lock-and-app-shortcuts.md) | ✅ Done — verified on device |
| 3 | [Home-screen widget](./phase-03-home-screen-widget.md) | ✅ Done — verified on device |
| 4 | [Nút điều khiển trên notification ghi âm](./phase-04-recording-notification-actions.md) | ✅ Done — verified on device |
| 5 | [Tự dừng ghi khi có cuộc gọi](./phase-05-auto-pause-on-phone-call.md) | ✅ Done — verified on device |
| 6 | [Kiểm chứng máy thật + kịch bản demo + bảng báo cáo](./phase-06-device-verification-and-demo.md) | 🟡 Main flow + features verified on device — demo script/video pending |

## Thứ tự & phụ thuộc

```
01 (0.5d, gate) ─┬─> 02 (1.5d)
                 ├─> 03 (2d)
                 └─> 04 (1d) ──> 05 (1.5d, cắt đầu tiên)
02,03,04,(05) ──> 06 (2d, bắt buộc)
```
- 02 và 03 không chung file → chạy song song được.
- 05 sau 04 vì cả hai gọi `session.pause/resume` và cùng sửa `recording-runtime.ts`.

## Quyết định chính

- Notification actions: **yarn patch `react-native-background-actions`** (thêm `addAction` +
  BroadcastReceiver), không đổi sang notify-kit — giữ nguyên đường ghi nền đã chạy.
- Cuộc gọi: **`AudioManager.addOnModeChangedListener`** (API 31+, không cần quyền), poll `getMode()`
  dưới API 31. Không dùng `READ_PHONE_STATE`.
- Widget: `react-native-android-widget` đọc **snapshot JSON** do app ghi; headless task không gọi API.
- Khoá sinh trắc là **lớp phủ UI** — không bao giờ dừng/làm gián đoạn phiên ghi.

## Cross-Plan Dependencies

Không chặn. Liên quan [260917 master plan](../260917-1821-meetio-full-implementation/plan.md)
Phase 07 (ghi âm, chờ máy thật) — Phase 06 ở đây kiểm luôn luồng ghi chính.

## Dependencies

- Thư viện mới: `expo-local-authentication@~57`, `expo-quick-actions`, `react-native-android-widget@^0.22`.
- Mọi thứ cần dev build (`expo run:android`), không chạy trên Expo Go.
