# Clarifications

## Session 2026-09-25
- Q: Phase 00 dùng thư viện STT nào (plan ghi @react-native-voice/voice, bản 3.2.4 từ 2022, không hỗ trợ New Arch)? → A: expo-speech-recognition (57.x, khớp Expo SDK 57, có continuous + requiresOnDeviceRecognition)
- Q: Spike có ép nhận diện chạy trên thiết bị (NFR-02)? → A: Đo cả hai chế độ, on-device là lượt chính, network là đối chứng; app log khả năng hỗ trợ vi-VN on-device của máy
- Q: Phạm vi phiên implement Phase 00? → A: App spike + script tính WER/tỉ lệ mất chữ (có test) + REPORT.md khung kèm hướng dẫn đo; kết luận để trống đến khi có số đo thật trên máy thật

## Session 2026-09-25 (Phase 04–05)
- Q: `POST /meetings/:id/end` kiểm tra "mọi segment đã đồng bộ" bằng cách nào? → A: Body `{last_seq?}`; seq cấp liên tục từ 1; server xả bộ gom lô rồi đếm đủ 1..last_seq trong Postgres; thiếu thì 409 `SEGMENTS_PENDING` kèm `details.missing_seqs` (tối đa 100); không gửi last_seq = cuộc họp không có đoạn nào
- Q: `DELETE /meetings/:id` xóa thật hay mềm? → A: Xóa vật lý ngay trong một transaction; DB cascade các bảng con; xóa luôn thực thể không còn mention; hoàn tác 10 giây là việc của client
- Q: Phase 04 kích hoạt pipeline tới đâu khi chưa có worker (Phase 11)? → A: Enqueue job thật vào BullMQ queue `meeting-processing`, jobId = meeting_id (idempotent); chuyển `ended → queued` cùng lúc; processor do Phase 11 gắn
- Q: Segment tới khi cuộc họp không còn recording/paused? → A: Nhận ở recording/paused/ended/queued; từ chối `INVALID_STATE_TRANSITION` ở processing/ready/failed; tác vụ tự đóng áp cho cả recording và paused quá 24h, đóng xong vẫn enqueue pipeline
- Q: Schema thiếu `audio_source`/`recording_quality` (data-model có, migration chưa có) và không có chỗ tính thời gian tạm dừng? → A: Migration 012 thêm hai enum + cột (mặc định `device_mic`/`standard`), `paused_at`, `paused_duration_ms`; `duration_sec` = (ended_at − started_at − tổng tạm dừng)
- Q: Upsert segment khi gửi trùng `(meeting_id, seq)` ghi đè hay giữ bản đầu? → A: Giữ bản đầu (`ON CONFLICT DO NOTHING`) để không đè bản người dùng đã sửa; vẫn phát ack cho bản trùng
- Q: Tiêu đề mặc định theo múi giờ nào? → A: `Cuộc họp DD/MM HH:mm` theo Asia/Ho_Chi_Minh khi client không gửi title
- Q: WebSocket nhận JWT ở đâu lúc bắt tay? → A: `handshake.auth.token`, dự phòng header `Authorization: Bearer`
