# Android nâng cao: tích hợp hệ thống cho bảo vệ cuộc họp

**Ngày:** 2026-10-05 · **Commits:** `d72efe8..0ec4eec` (8 commit)
**Trạng thái:** review round 2–3 đạt 9/10 SEALED, cổng evidence SEALED. Chưa chạy trên máy thật (Xiaomi, HyperOS, Android 16). Phase 06 còn lại.

## Đã làm

**Quyết định thiết kế ban đầu:** dự án điểm 10 bắt buộc chứng minh kỹ năng Android nâng cao, thời gian 1–2 tuần với demo trực tiếp trên điện thoại. Brainstorm chọn nhiều tính năng nhỏ thay vì một cái lớn (tích hợp 3 thư viện, 4 tính năng hệ thống, 1 module Kotlin mới).

- **App lock bằng xác thực sinh trắc học:** overlay chặn interaction, 30s tự khóa lại, auth screen kích bật/tắt. Widget Recents screenshot bị xóa (`setRecentsScreenshotEnabled(false)`) bằng module Kotlin mới `recents-privacy` (API 33+). Quyết định: dùng cách này thay FLAG_SECURE vì khi chiếu lên projector trong demo, FLAG_SECURE sẽ tắt hết màn hình.
- **Launcher shortcuts:** `expo-quick-actions` (iOS/Android), routing phải sống trong `app/(app)/_layout.tsx` không phải root.
- **Widget home-screen:** `react-native-android-widget` đọc file snapshot, sự kiện OPEN_URI click được, ẩn title khi app lock, phát hành chỉ sau khi biến trạng thái lock được khởi tạo.
- **Control từ notification:** Pause/Resume/End qua `react-native-background-actions` với yarn patch (vì notifee bỏ bảo trì, notify-kit chưa test trên RN 0.86). Patch xử: `PendingIntent.getBroadcast` phải immutable + setPackage, receiver RECEIVER_NOT_EXPORTED.
- **Auto-pause khi có cuộc gọi:** module Kotlin mới `call-state` đọc AudioManager mode thay READ_PHONE_STATE (không xin permission). Baseline lấy trạng thái đầu tiên (VoIP call sẽ MODE_IN_COMMUNICATION ngay).
- **Rủi ro native:** tất cả 3 thư viện (widget, quick-actions, background-actions) chỉ claim hỗ trợ RN ≤0.83; build thành công trên Expo 57 / RN 0.86.3 ngay day 1.
- **Test & CI:** mobile 1.829/1.829 test (từ 1.634), API 655/655, typecheck/lint sạch, assembleDebug exit 0.

## Quyết định đáng nhớ

- **Race condition giữa nút, notification, sự kiện cuộc gọi:** review vòng 1 (7/10 REWORK) phát hiện ba đua: user pause trên button có thể bị tính là cuộc gọi gây auto-resume; `end()` giữa auto-resume in-flight bị ghi đè; cuộc gọi kết thúc nhanh khi pause đang flush → meeting bị paused. Lỗi là `busy` flag ở tầng notification. **Sửa:** thêm `hasStarted` flag vào RecordingSession, serialize pause/resume/end bên trong session (mỗi cái đọc phase riêng), pause() trả boolean (có pause được không), call state giữ flag riêng. Bài học: khi có 2+ input source ghi state machine, serialize ở state machine, không ở từng source.
- **Chọn baseline cho call state:** nếu RecordingSession bắt đầu lúc call đang chạy, không tự pause ngay. Trạng thái đầu tiên được lấy làm baseline.
- **Widget publish sau hydration:** title bị đưa ra trước khi lock flag được đọc (mặc định false). Gated trên zustand ready.
- **Cây test shared zustand store:** test 1 để cây mounted, test 2 mount lại → store chung gây extra biometric prompts. Sửa: unmount trong afterEach.
- **Bảng thiết đặt section async:** test render section → device check (init zustand) → state update sau teardown. Không làm yếu lookup positional; mock section riêng trong bảng thiết đặt test.
- **Parity docs/code:** edit `docs/privacy-policy.md` làm test match content trong app gãy (word-for-word check). Cổng evidence chặn đến khi sync `src/content/privacy-policy.ts`. Consent version không bump (data thiết bị local only).

## Bãi mìn gặp phải

- **Thư viện widget xác nhận API 33+ không đúng:** setRecentsScreenshotEnabled chỉ có API 33 nhưng thư viện không define — lint pass, runtime fail trên Android < 13. Thêm check `Build.VERSION.SDK_INT >= 33` quanh gọi.
- **Yarn patch PendingIntent immutable:** Android 12+ bắt buộc PendingIntent.FLAG_IMMUTABLE trên broadcast. notifee không xử, react-native-background-actions cũng không → patch rồi mới chạy.
- **Baseline call state khi app start giữa call:** nếu user start recording khi call đang chạy, MODE_IN_COMMUNICATION → app pause ngay. Quyết định đặt baseline là state đầu tiên.

## Bài học

- **Serialization chi tiết quan trọng khi nhiều input một state machine.** Race condition không phải là tư duy; nó là kết quả của ba paths mở song song ghi cùng dữ liệu. Lần tới: sketch tất cả input sources trước code, xác định thứ tự.
- **Thư viện patch cần test hết trên assembleDebug thực.** Yarn patch PendingIntent là vấn đề vận hành, không thể mock được — phải build APK.
- **Zustand store shared giữa test cases là rủi ro.** Test setup/teardown phải bao gồm clean state.
- **Docs parity test đơn thuần nhưng mạnh.** Khi privacy policy trong app, test so sánh bytes. Edit một cái gây xoay sổ.

## Việc còn mở

- Phase 06 (chứng danh trên máy thật, đặc tả demo, video fallback).
- Chưa chạy trên máy thật: Xiaomi, HyperOS, Android 16; màn hình đã khóa, sau tháo charger không plug lại.
- Hoãn: `setAuthenticationRequired` trên notification actions; `start()`/`resumeUnfinished` ngoài serial queue.
- Công cụ verify: app overlay không chặn khi tắt app lock; pause on call không gây auto-resume on user resume; widget title ẩn/hiện khớp với app lock; launcher shortcuts navigate đúng path.
