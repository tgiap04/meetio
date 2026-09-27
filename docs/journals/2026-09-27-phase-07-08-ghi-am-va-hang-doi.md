# Phase 07+08: ghi âm thật, nhận diện trên máy, hàng đợi bền

**Ngày:** 2026-09-27
**Trạng thái:** đã implement, chờ kiểm máy thật. Người dùng phát hiện "ghi âm chưa hoạt động": màn 05/06/07 vẫn là
prototype dữ liệu giả vì Phase 07 bị cổng Phase 00 chặn. Người dùng mở cổng, làm gộp 07+08. Cổng evidence chặn vì
số đo Phase 00, chạy 60 phút, khóa màn hình, máy bay, kill thật — đều cần thiết bị.

## Đã làm

- **Engine:** chỉ nhận diện trên máy (`requiresOnDeviceRecognition` luôn bật); ngôn ngữ = gói offline đã cài ∩ {vi, en};
  Android < 13 không liệt kê gì. Lõi tự khởi động lại port từ spike; khoảng chết ≥ 1s thành `gap_before_ms`.
- **Hàng đợi SQLite** (`src/queue/`): ghi đoạn + cấp seq trong một giao dịch trước khi gửi; worker phát lại
  create (id do client sinh) → pause/resume (kèm `at`) → đoạn qua WS có ack, dồn > 50 hoặc RATE_LIMITED thì `/bulk` →
  `end` khi hết đoạn chờ. API nhận `id`/`started_at`/`at`, kẹp thời gian ở server.
- Banner "Có cuộc họp chưa kết thúc" ở Home; foreground service Android, background audio iOS; màn 07 trạng thái thật.

## Quyết định đáng nhớ

- **Vá expo-speech-recognition (iOS) để thất bại đóng:** bản gốc chỉ đặt `requiresOnDeviceRecognition` khi recognizer hỗ
  trợ on-device — ngôn ngữ không hỗ trợ thì âm thanh lặng lẽ lên máy chủ Apple, và `installedLocales` trên iOS chỉ là
  danh sách ngôn ngữ máy chủ. Cả hai sửa qua `.yarn/patches`. Đọc mã native của thư viện trước khi tin vào tên cờ.
- **Hàng đợi gắn chủ sở hữu, và kiểm ở chỗ gắn token:** reviewer tìm ra lượt đồng bộ đang chạy khi đổi tài khoản trên
  cùng máy sẽ gửi cuộc họp của A bằng token của B. Kiểm `ownerId` trong worker là chưa đủ (còn khe giữa kiểm và gửi);
  chặn trong request interceptor của axios (`expectedOwnerId` so với `sub` của token đang gắn) thì không còn khe.
- Test hàng đợi chạy SQL thật trên `node:sqlite` (Node 24) sau cùng một interface với expo-sqlite — test hỗn loạn 30 lần
  "kill" (mở lại cùng file DB) bắt được lỗi xóa-trước-khi-ack khi kiểm đột biến.

## Bãi mìn

- `QueryClient` trong test giữ timer gcTime 5 phút → jest chạy một file mất > 300s dù test chạy trong ms. `gcTime: Infinity`
  + `clear()` sau mỗi test.
- Renderer không unmount giữa các test vẫn nghe store Zustand dùng chung → test sau thấy `Redirect` của màn cũ.
- Màn 06 sau khi `end`: vừa `replace` sang 07 vừa bị store idle đẩy về Home — cần cờ "đã rời đi".
- Hook socket có sẵn dùng `EXPO_PUBLIC_WS_URL`, không phải `API_URL`.
- Một lần chạy toàn bộ suite mất một worker jest vì SIGSEGV (9 lần sau xanh) — chưa rõ nguyên nhân; đã cache prepared
  statement trong adapter `node:sqlite` để giảm rủi ro.

## Bài học

- Subagent viết test: có một test tạo `loop2` rồi không khẳng định gì; test "nhường quyền cuộn" không kiểm con số (N) lẫn
  việc không tự cuộn — viết lại và kiểm đột biến. Báo cáo "21 test" thực tế 19.
- Project-manager ghi "hàng đợi 3.600 đoạn: code ✓" (chưa đo) và "Phase 01–16 đầy đủ 41 story" (Phase 09 chưa làm) — sửa.
- Doc-writer viết "khi mạng chập chờn mới lưu tạm" — sai: mọi đoạn đều lưu tạm trước khi gửi. Sửa cả tài liệu lẫn bản trong app.

## Việc còn mở

- Build lại app (3 module native mới): `npx expo run:android` / `run:ios`.
- Số đo Phase 00; kiểm máy thật: 60 phút, khóa màn hình 10 phút, máy bay 10 phút, kill ×30, hàng đợi 3.600 đoạn trên máy yếu.
- Giới hạn: notification Android không có nút Kết thúc; chạm sau khi OS kill tiến trình thì về Home (banner); Bluetooth do
  OS định tuyến; iOS không loại được file SQLite khỏi iCloud (chỉ đoạn chưa ack).
- Phase 09 (dịch) đã mở khóa.
