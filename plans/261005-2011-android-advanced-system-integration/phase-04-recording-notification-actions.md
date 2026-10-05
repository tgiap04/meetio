# Phase 04 — Nút điều khiển trên notification ghi âm

## Context Links
- [Nghiên cứu thư viện §4](../reports/researcher-2026-10-05-android-advanced-libs.md)
- `apps/mobile/src/recording/background-keepalive.ts`, `recording-runtime.ts`, `recording-session.ts`
- Mẫu patch sẵn có: `.yarn/patches/expo-speech-recognition-npm-57.1.0-50fb306965.patch`
- US-09 (pause/resume), US-10 (ghi nền)

## Overview
- Priority: P2 · Effort: 1d · Status: ✅ done — verified on device by the user (2026-10-05) · Blocked by: Phase 01
- Notification foreground service đang ghi có nút **Tạm dừng / Tiếp tục** và **Kết thúc**; nhãn đổi theo trạng thái;
  thời gian ghi hiển thị bằng chronometer.

## Key Insights
- `react-native-background-actions` 4.1.0 không hỗ trợ action (issue #60). notifee đã archive; notify-kit
  chưa test RN 0.86 và buộc kiểm lại toàn bộ đường ghi nền → **yarn patch** (~60–80 dòng Java).
- `updateNotification` của lib gọi lại `buildNotification` → đổi nhãn Pause/Resume qua đó.
- "Kết thúc" từ notification phải đi qua `session.end()` (đường duy nhất đã có test), không dừng service trực tiếp.

## Deviations from Plan

1. **Notification "Kết thúc" action**: Does not bring the app to the foreground. When user presses "Kết thúc" from notification, the session ends and app moves to recording-done screen only when the app is reopened by the user.

2. **Session state serialization**: `pause()` / `resume()` / `end()` in `recording-session.ts` are now fully serialized to prevent race conditions. `pause()` returns boolean to indicate success.

## Requirements
- Functional
  - Recording: [Tạm dừng] [Kết thúc]; Paused: [Tiếp tục] [Kết thúc]; Ending: không có nút.
  - Bấm khi app ở nền/màn khoá vẫn chạy (JS còn sống nhờ foreground service).
  - "Kết thúc" mở app tới `recording-done` sau khi end được nhận (như bấm trong app).
- Non-functional: không đổi foregroundServiceType, không thêm quyền.

## Architecture
```
Patch (Java, trong lib):
  options.actions: [{ id: 'pause'|'resume'|'end', title }]
  buildNotification: for each → addAction(0, title, PendingIntent.getBroadcast(FLAG_IMMUTABLE, intent action=<pkg>.BG_ACTION, extra id))
  BroadcastReceiver (đăng ký runtime trong service, RECEIVER_NOT_EXPORTED) → emit 'meetioNotificationAction' {id}
JS:
  recording-notification.ts: subscribe store.phase → BackgroundService.updateNotification({ actions, taskDesc })
  onNotificationAction(id) → runtime.session.pause/resume/end
```

## Related Code Files
- Create: `.yarn/patches/react-native-background-actions-npm-4.1.0-b64a27cb35.patch` (Java addAction + BroadcastReceiver + DeviceEventEmitter)
- Modify: root `package.json` `resolutions` (patch protocol)
- Create: `apps/mobile/src/recording/recording-notification-actions.ts` (map phase → actions, listener → session)
- Modify: `apps/mobile/src/recording/background-keepalive.ts` (pass actions, export `updateKeepaliveActions`)
- Modify: `apps/mobile/src/recording/recording-runtime.ts` (attach listener)
- Modify: `apps/mobile/src/recording/recording-session.ts` (serialize pause/resume/end, return boolean from pause)
- Tests: `recording-notification-actions.test.ts`

## Implementation Steps
1. `yarn patch react-native-background-actions`; sửa `Options` đọc mảng `actions`, `buildNotification` thêm action, receiver phát event qua `DeviceEventManagerModule`.
2. Khai báo kiểu TS cho `actions` (module augmentation trong `src/recording/`).
3. Hàm thuần `actionsForPhase(phase)` + test.
4. Listener: `DeviceEventEmitter.addListener('meetioNotificationAction', ...)` → session; bỏ qua nếu phase không khớp (bấm trùng hai lần).
5. Subscribe store phase → `updateNotification`.
6. Rebuild (`expo run:android`), kiểm trên máy: khoá màn hình → pause → resume → end.

## Todo List
- [x] patch Java + commit patch
- [x] kiểu TS
- [x] actionsForPhase + test
- [x] listener + chống bấm trùng + test
- [x] update nhãn theo phase
- [x] device verification: pause từ notification → transcript ngừng, resume → chạy lại
- [x] device verification: end → app tới màn kết thúc khi reopened
- [x] device verification: offline vẫn hoạt động (op ghi vào queue)

## Success Criteria
- Test xanh; trên máy: pause từ notification → đồng hồ trong app dừng, transcript ngừng; resume → chạy lại; end → app tới màn kết thúc; offline vẫn hoạt động (op ghi vào queue như bấm trong app).

## Risk Assessment
- Android 14 yêu cầu `RECEIVER_NOT_EXPORTED` khi đăng ký receiver runtime → bắt buộc trong patch.
- Nâng cấp lib sau này mất patch → ghi chú trong `docs/system-architecture.md`.
- Phương án dự phòng nếu patch kẹt > 0.5d: chỉ giữ nút "Mở app" + deep link, cắt nút.

## Security Considerations
- PendingIntent `FLAG_IMMUTABLE` + intent tường minh theo package; receiver không export → app khác không giả lệnh dừng ghi.

## Next Steps
- Phase 05 dùng chung listener/đường pause.
