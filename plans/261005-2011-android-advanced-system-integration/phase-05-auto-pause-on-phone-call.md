# Phase 05 — Tự dừng ghi khi có cuộc gọi (cắt đầu tiên nếu trễ)

## Context Links
- [Nghiên cứu thư viện §5](../reports/researcher-2026-10-05-android-advanced-libs.md) (có bản phác Kotlin)
- Mẫu Expo Module sẵn có: `apps/mobile/modules/mlkit-translate/`
- `apps/mobile/src/recording/recording-session.ts`, `recording-runtime.ts`, `recording.store.ts`

## Overview
- Priority: P3 · Effort: 1.5d · Status: implemented — pending device verification · Blocked by: Phase 04
- Khi máy đổ chuông / đang gọi (di động hoặc VoIP) → tự **tạm dừng** ghi; cuộc gọi xong → tự **tiếp tục**,
  chỉ khi chính cuộc gọi đã làm nó dừng. App hiện banner "Đã tạm dừng vì có cuộc gọi".

## Key Insights
- `AudioManager.addOnModeChangedListener` (API 31+) **không cần quyền**: MODE_RINGTONE / MODE_IN_CALL /
  MODE_IN_COMMUNICATION → bận; MODE_NORMAL → rảnh. Dưới API 31: poll `getMode()` mỗi 1s.
- Không dùng TelephonyCallback (cần READ_PHONE_STATE, chỉ bắt cuộc gọi di động) hay AudioFocus (phải
  giành focus → dừng nhạc người dùng).
- Foreground service giữ process sống → event vẫn tới JS khi màn hình tắt.
- Suy luận chưa kiểm: trong cuộc gọi mic bị câm → kiểm trên máy (MIUI, Samsung).

## Deviations from Plan

1. **Ongoing call handling**: If a call is already in progress when recording starts, it is ignored — the app does not pause an ongoing session start. Only calls that occur *after* recording has begun will trigger pause/resume.

## Requirements
- Functional
  - Chỉ lắng nghe khi phase = recording/paused; dừng lắng nghe khi idle/ending.
  - Bận + phase recording → `session.pause()`, đánh dấu `pausedBy: 'call'`.
  - Rảnh + `pausedBy === 'call'` → `session.resume()`; người dùng tự pause thì **không** tự resume.
  - Người dùng bấm resume giữa cuộc gọi → xoá `pausedBy`, tôn trọng lựa chọn.
  - Notification (Phase 04) và banner hiện lý do.
- Non-functional: không thêm quyền manifest; không config plugin.

## Architecture
```
modules/call-state (Kotlin Expo Module)
  Events("onCallStateChange")  payload { busy: Boolean }
  startWatching() / stopWatching()  — API≥31 listener, <31 Handler poll 1s; chỉ phát khi đổi
src/recording/call-interruption.ts
  createCallInterruption({ session, store, watcher }) — logic thuần, test được với watcher giả
recording.store: thêm pausedBy: 'user' | 'call' | null
```

## Related Code Files
- Create: `apps/mobile/modules/call-state/expo-module.config.json`, `index.ts`,
  `android/build.gradle`, `android/src/main/java/expo/modules/callstate/CallStateModule.kt`
- Create: `apps/mobile/src/recording/call-interruption.ts` + `call-interruption.test.ts`
- Modify: `apps/mobile/src/recording/recording.store.ts` (`pausedBy`), `recording-session.ts` (đặt `pausedBy` ở pause/resume — giữ nguyên chữ ký hàm)
- Modify: `apps/mobile/src/recording/recording-runtime.ts` (gắn interruption)
- Modify: `apps/mobile/app/(app)/recording-live.tsx` hoặc component con (banner lý do)
- Modify: `apps/mobile/src/recording/recording-notification-actions.ts` (taskDesc khi `pausedBy === 'call'`)
- iOS: module trả no-op (`platforms: ["android"]` + stub JS) — không làm iOS.

## Implementation Steps
1. Test + `call-interruption.ts` với watcher giả (các ca: gọi đến khi ghi; người dùng tự pause rồi có gọi; resume tay giữa cuộc gọi; gọi khi ending).
2. Thêm `pausedBy` vào store + session; cập nhật test session.
3. Viết module Kotlin (theo phác thảo trong báo cáo nghiên cứu); stub JS cho Jest/iOS.
4. Gắn vào runtime; banner + nhãn notification.
5. Rebuild, kiểm máy thật: gọi từ máy khác; gọi Zalo/Messenger (VoIP).

## Todo List
- [x] logic thuần + test
- [x] pausedBy store/session + test
- [x] Kotlin module + stub
- [x] wiring + banner + notification
- [ ] device verification: gọi đến khi ghi → app dừng ≤ 2s
- [ ] device verification: cúp máy → tự ghi tiếp
- [ ] device verification: người dùng tự pause trước → sau cuộc gọi vẫn dừng
- [ ] device verification: VoIP (Zalo/Messenger) vẫn hoạt động

## Success Criteria
- Test xanh; trên máy: gọi đến khi đang ghi → app dừng trong ≤ 2s, transcript có khoảng trống; cúp máy → tự ghi tiếp; người dùng tự pause trước thì sau cuộc gọi vẫn dừng.

## Risk Assessment
- Mode không đổi trên một số ROM → fallback poll cũng dùng `getMode()`; nếu vẫn không bắt được trên máy demo → cắt phase, ghi vào báo cáo là "đã thử, giới hạn ROM".
- Họp online bằng Zoom/Meet trên chính điện thoại làm mode = IN_COMMUNICATION → app tự dừng; đúng bối cảnh chính (họp trên laptop, điện thoại ghi) thì không xảy ra. Ghi rõ trong báo cáo.

## Security Considerations
- Không đọc số điện thoại hay danh bạ; chỉ đọc chế độ âm thanh.

## Next Steps
- Phase 06.
