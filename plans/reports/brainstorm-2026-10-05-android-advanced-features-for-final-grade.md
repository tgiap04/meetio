# Brainstorm — Tính năng Android nâng cao cho báo cáo cuối kỳ

**Ngày:** 2026-10-05 · **Lens:** CTO (mặc định)

## Bài toán
- Môn "Lập trình Android nâng cao" — chấm chủ yếu theo **độ phủ kỹ thuật Android nâng cao**.
- Hạn: 1–2 tuần. RN/Expo được chấp nhận hoàn toàn. Bảo vệ: **demo live trên điện thoại**.
- Dự án đã rất lớn (GraphRAG, STT, offline queue, ~2.250 test) → thiếu không phải tính năng, mà là tính năng **chạm vào hệ điều hành** thầy nhìn thấy được.

## Hiện trạng liên quan
- Đã có: foreground service loại `microphone` (`plugins/with-microphone-foreground-service.js`), native module Kotlin (`modules/mlkit-translate`), config plugin sửa Manifest, SQLite offline, runtime permission, push notification, deep link `meetio://recording-live`.
- Chưa có: widget, biometric, app shortcuts, notification actions, xử lý cuộc gọi đến.
- **Rủi ro lớn nhất:** Phase 07/08/18/19/21 (ghi âm, queue, STT stream, ML Kit) vẫn "chờ kiểm chứng máy thật".

## Các hướng đã xét
| Hướng | Ưu | Nhược |
|---|---|---|
| A. Ghi họp 1 chạm (widget + QS tile + shortcuts + notif actions) | Một câu chuyện thống nhất, demo trực quan | QS tile cần Kotlin + plugin |
| B. Họp theo lịch (CalendarContract + alarm + biometric) | Gắn sản phẩm nhất | Exact alarm bị MIUI chặn, demo phải canh giờ |
| **C. Nhiều tính năng nhỏ** ✅ | Phủ rộng API Android, mỗi mục độc lập, cắt được | Rời rạc → cần đóng khung câu chuyện |

## Hướng đã chốt: C — 4 hạng mục
Thứ tự thi công (giá trị/rủi ro); cắt từ dưới lên nếu trễ:

1. **Khoá vân tay + App Shortcuts** (~1,5 ngày, rủi ro thấp) — `expo-local-authentication` (BiometricPrompt) khoá khi mở app / quay lại từ nền sau N giây, fallback PIN thiết bị, bật/tắt trong Cài đặt; `expo-quick-actions` (ShortcutManager): Ghi mới / Hỏi AI / Việc cần làm qua deep link.
2. **Home-screen widget** (~2 ngày) — `react-native-android-widget`: nút ● Ghi (deep link), số việc cần làm chưa xong, cuộc họp gần nhất; cập nhật khi dữ liệu đổi + định kỳ. Thành phần: AppWidgetProvider, RemoteViews, PendingIntent.
3. **Notification actions khi đang ghi** (~1 ngày) — Tạm dừng / Tiếp tục / Dừng trên notification foreground service. Cần kiểm tra `react-native-background-actions` có hỗ trợ action không; nếu không → notifee.
4. **Tự dừng khi có cuộc gọi** (~1,5 ngày, rủi ro TB — cắt đầu tiên) — Kotlin module nhỏ nghe AudioFocus loss / call state → pause, hết gọi → resume; thêm vào module native hiện có hoặc module mới + config plugin.

**Bắt buộc, không cắt:** 2 ngày test luồng chính trên máy thật (ghi → kết thúc → pipeline → tóm tắt → hỏi đáp) + 4 tính năng mới.

## Điểm cần lưu ý
- Widget/shortcut/notification đều cần **dev build** (`expo run:android`), không chạy Expo Go.
- Notification action/widget chạy khi JS có thể chưa sống → logic phải qua headless task / deep link, không gọi thẳng store.
- Biometric khoá không được làm gián đoạn phiên ghi đang chạy nền (US-02 AC).
- Android 13+ cần `POST_NOTIFICATIONS` (đã có); call state cần `READ_PHONE_STATE` → xin quyền đúng lúc, từ chối thì vẫn chạy bình thường.
- Xiaomi/MIUI: kiểm tra autostart/battery saver với widget và foreground service.

## Đo thành công
- Mỗi tính năng demo được trên máy thật theo kịch bản cố định ≤ 5 phút.
- Test unit cho phần logic JS (lock timeout, map shortcut → route, widget data shaping).
- Báo cáo có bảng **"tính năng → thành phần Android"** gồm cả cái đã có (foreground service, native module, config plugin, SQLite, permission, notification) + 4 cái mới, đóng khung chủ đề "Meetio tích hợp sâu vào hệ điều hành Android".

## Tiếp theo
- Lập plan chi tiết (`/tkm:create-plan`) nếu người dùng đồng ý.

## Chưa giải quyết
- `react-native-background-actions` có hỗ trợ notification action không — xác minh khi lập plan.
- Thời gian khoá biometric khi quay lại từ nền (đề xuất 30s) — chốt khi lập plan.
