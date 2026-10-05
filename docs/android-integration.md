# Meetio — Tích hợp hệ thống Android

Tài liệu tổng hợp các điểm app `apps/mobile` chạm vào API/thành phần riêng của Android (ngoài phần
React Native thuần). Mọi đường dẫn tính từ `apps/mobile/`. Kiến trúc chung xem
[`system-architecture.md`](system-architecture.md); phần ghi âm ở mục 1 và 2 của tài liệu đó.

## Bảng tổng hợp: Tính năng → Thành phần Android → File

| Tính năng | Thành phần Android | File | Vì sao có |
|---|---|---|---|
| Ghi tiếp khi tắt màn hình / xuống nền | Foreground service `foregroundServiceType="microphone"`, quyền `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`, `WAKE_LOCK` | `plugins/with-microphone-foreground-service.js`, `src/recording/background-keepalive.ts` | Android 14+ giết service không khai loại; không có nó cuộc họp dài bị mất giữa chừng. |
| Dịch trên máy | Module Kotlin Expo (Google ML Kit Translate) | `modules/mlkit-translate/`, `MlkitTranslateModule.kt` | Bản chép lời không rời điện thoại khi dịch. |
| Sửa `AndroidManifest` bằng config plugin | `withAndroidManifest`, `AndroidConfig.Permissions.withPermissions` | `plugins/with-microphone-foreground-service.js`, `app.config.ts` | Cấu hình native lặp lại được khi `expo prebuild`, không sửa tay thư mục `android/`. |
| Hàng đợi offline | SQLite (`expo-sqlite`) trong bộ nhớ riêng của app | `src/queue/queue-db.ts` | Mất mạng hay app bị giết không mất đoạn chép lời chưa gửi. |
| Quyền runtime | Hộp thoại quyền micro / nhận diện giọng nói / `POST_NOTIFICATIONS` (API 33+) | `src/recording/expo-stt-engine.ts`, `src/recording/background-keepalive.ts` | Quyền nguy hiểm phải xin lúc dùng. |
| Push | `expo-notifications` + FCM (`google-services.json`, đã gitignore) | `src/notifications/push-registration.ts`, `app.config.ts` | Báo khi cuộc họp xử lý xong. |
| Deep link | Scheme `meetio://` (expo-router) | `app.config.ts` (`scheme`), `src/widget/widget-links.ts` | Widget, shortcut, nút thông báo mở đúng màn. |
| Chống sao lưu | `android:allowBackup=false` | `app.config.ts` (`android.allowBackup`) | Hàng đợi và snapshot chứa nội dung họp không vào Google Drive. |
| **Khoá sinh trắc học** | `BiometricPrompt` (qua `expo-local-authentication`), cửa sổ Activity (`setRecentsScreenshotEnabled` / `FLAG_SECURE`) | `src/security/`, `src/components/security/app-lock-gate.tsx`, `src/hooks/use-app-lock-lifecycle.ts`, `modules/recents-privacy/` | Người cầm máy đang mở khoá không đọc được cuộc họp. |
| **Lối tắt launcher** | `ShortcutManager` (nhấn giữ icon) | `src/navigation/app-shortcuts.ts`, `assets/shortcuts/*`, plugin `expo-quick-actions` trong `app.config.ts` | Vào thẳng "Ghi cuộc họp mới", "Hỏi AI", "Việc cần làm". |
| **Widget màn hình chính** | `AppWidgetProvider` (qua `react-native-android-widget`), headless JS task | `src/widget/*`, `src/hooks/use-widget-snapshot-sync.ts`, `index.ts` | Ghi một chạm và xem việc cần làm không cần mở app. |
| **Nút trên thông báo ghi âm** | `Notification.Action` + `PendingIntent.getBroadcast`, `BroadcastReceiver` | `.yarn/patches/react-native-background-actions-npm-4.1.0-*.patch`, `src/recording/recording-notification-actions.ts` | Tạm dừng / tiếp tục / kết thúc từ thanh thông báo. |
| **Tự tạm dừng khi có cuộc gọi** | `AudioManager` mode + `OnModeChangedListener` | `modules/call-state/`, `CallStateModule.kt`, `src/recording/call-interruption.ts` | Cuộc gọi chiếm micro; tránh ghi tạp âm rồi quên bật lại. |

Dòng in đậm là năm tích hợp mới; phần còn lại có từ trước.

## Khoá sinh trắc học

- **Cách hoạt động:** `AppLockGate` bọc nhóm `(app)`, phủ màn khoá lên trên khi `locked`; cây màn hình vẫn mount nên
  stack điều hướng và màn ghi âm giữ nguyên. Cờ bật/tắt lưu ở `expo-secure-store` (`meetio.app_lock_enabled`),
  khởi động nguội bắt đầu ở trạng thái khoá. Khoá lại khi quay về sau >= 30 giây ở nền (`LOCK_AFTER_BACKGROUND_MS`,
  `src/security/app-lock-policy.ts`).
- **Là lớp phủ UI:** ghi âm, worker đồng bộ và foreground service chạy tiếp bên dưới.
- **Bảo mật:** bật và tắt đều phải xác thực (bật: chứng minh mở lại được; tắt: không ai tắt lén trên máy đang mở).
  Khi khoá, nội dung bên dưới bị ẩn với TalkBack (`importantForAccessibility="no-hide-descendants"`). Ảnh xem trước ở
  màn hình đa nhiệm bị làm trống: Android 13+ dùng `setRecentsScreenshotEnabled(false)` (vẫn chụp màn hình được);
  thấp hơn dùng `FLAG_SECURE` (chặn cả chụp màn hình).
- **Giới hạn:** chấp nhận cả mã PIN/hình mở khoá (không chỉ vân tay) vì `disableDeviceFallback` tắt; máy chưa đặt khoá
  màn hình thì không bật được. Đọc cờ lỗi thì mặc định "tắt" (fail-open) để không tự khoá vĩnh viễn.

## Lối tắt launcher

- **Cách hoạt động:** `registerAppShortcuts` gọi `QuickActions.setItems` với 3 mục (`record`, `ask`, `actions`),
  icon adaptive sinh từ `assets/shortcuts/` lúc prebuild. Mỗi mục mang `href`; định tuyến đi qua layout `(app)`.
- **Bảo mật:** vì đi qua layout `(app)`, guard đăng nhập và màn khoá áp dụng như thao tác trong app.
- **Giới hạn:** chỉ Android; launcher từ chối (vượt giới hạn) thì bỏ qua, không crash.

## Widget màn hình chính

- **Cách hoạt động:** widget `MeetioWidget` (4x2, `updatePeriodMillis` 30 phút) vẽ trong headless JS task có thể chạy
  khi app đóng, nên handler đăng ký ở entry tuỳ biến `index.ts` (`package.json` `main`), không ở màn nào. Widget không
  gọi API; app ghi snapshot (`useWidgetSnapshotSync` -> `publishWidgetSnapshot`) rồi `requestWidgetUpdate`. Nút mở
  app bằng deep link `OPEN_URI` (`meetio://recording-setup`, `recording-live`, `actions`, `meeting-detail?id=`).
- **Quyền riêng tư:** snapshot là `widget-snapshot.json` trong `Paths.document` (bộ nhớ riêng của app, không đi vào
  sao lưu), gồm: đã đăng nhập, đang ghi, số việc mở, cuộc họp gần nhất (id, trạng thái, tiêu đề). **Không** có token
  hay transcript. Khi khoá app bật, `title = null` vì màn hình chính ai cũng thấy. Đăng xuất đẩy snapshot "chưa đăng nhập".
- **Giới hạn:** chỉ Android; 30 phút là mức cập nhật định kỳ thấp nhất của hệ thống, nên cập nhật thực tế dựa vào app đẩy.

## Nút trên thông báo ghi âm

- **Cách hoạt động:** `react-native-background-actions` 4.1.0 được yarn-patch để nhận `actions: {id,title}[]`, dựng
  `PendingIntent.getBroadcast` với intent tường minh (`setPackage`) và cờ `FLAG_IMMUTABLE`. Một `BroadcastReceiver`
  đăng ký `RECEIVER_NOT_EXPORTED` phát sự kiện JS `RNBackgroundActionsNotificationAction` với id nút.
  `wireRecordingNotification` gọi đúng `pause` / `resume` / `end` của phiên ghi, và vẽ lại nút theo pha
  (ghi: Tạm dừng + Kết thúc; tạm dừng: Tiếp tục + Kết thúc).
- **Tuần tự hoá:** `createRecordingSession` chạy `pause`/`resume`/`end` lần lượt qua `serial()`; mỗi thao tác đọc pha
  khi tới lượt nên bấm "Kết thúc" lúc đang pause vẫn kết thúc đúng, bấm đúp thì bỏ qua. `pause()` trả `boolean`
  (true khi chính lần gọi đó đã tạm dừng).
- **Bảo mật:** chỉ app này gửi/nhận được broadcast (explicit + immutable + not exported).
- **Giới hạn:** nút "Kết thúc" không đưa app lên foreground (broadcast, không mở Activity): cuộc họp kết thúc ở nền,
  người dùng mở app để xem. Lỗi thao tác được ghi vào `problem` của store.

## Tự tạm dừng khi có cuộc gọi

- **Cách hoạt động:** module Kotlin `CallState` chỉ đọc `AudioManager.mode`; "bận" là `MODE_RINGTONE`,
  `MODE_IN_CALL` hoặc `MODE_IN_COMMUNICATION` (gồm cả cuộc gọi VoIP như Zalo, Messenger, Meet). API 31+ dùng
  `OnModeChangedListener`; thấp hơn thăm dò mỗi 1 giây. Chỉ phát sự kiện `onCallStateChange` khi trạng thái đổi.
  `createCallInterruption` tạm dừng khi bận và tự ghi tiếp khi hết, nhưng chỉ nếu chính cuộc gọi gây ra lần dừng
  (`store.pausedBy === 'call'`); người dùng tự ghi tiếp giữa cuộc gọi thì cuộc gọi kết thúc không làm gì. Màn
  `recording-live` hiện banner và thông báo đổi dòng mô tả.
- **Quyền riêng tư:** không dùng `READ_PHONE_STATE`, không đọc số điện thoại hay nhật ký cuộc gọi, không cần quyền mới.
- **Giới hạn:** cuộc gọi đã diễn ra lúc bắt đầu ghi bị bỏ qua (bắt đầu ghi giữa cuộc gọi là chủ ý); nhận diện bằng
  audio mode nên ứng dụng khác đặt mode giao tiếp (không phải cuộc gọi) cũng có thể kích hoạt; chỉ Android.
