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

## Session 2026-09-25 (Phase 07–08 → 10–11)
- Q: Phase 07 bị chặn cứng bởi Phase 00 (chưa có số đo), Phase 08 phụ thuộc 07 — làm gì? → A: Giữ nguyên cổng chặn; chuyển sang Phase 10 và 11, Phase 07/08 đợi số đo Phase 00
- Q: Phase 11 — bước pipeline chưa có handler (tới Phase 12–14 mới có) thì cuộc họp đi tới đâu? → A: Dừng ở bước đầu tiên chưa có handler; cuộc họp giữ `processing`, bước đó `pending`; không bao giờ báo `ready` giả; sweep chạy tiếp khi handler được gắn
- Q: Push notification "xử lý xong"? → A: Expo Push Service; bảng token thiết bị + endpoint đăng ký/hủy; nội dung chung chung (không tiêu đề, không trích transcript) kèm meeting_id; đúng một thông báo mỗi cuộc họp; mobile đăng ký bằng expo-notifications
- Q: Phạm vi mobile Phase 10? → A: Nối API thật cho màn Thư viện, Chi tiết, Transcript có sẵn (cuộn vô hạn, tìm, sửa đoạn, xóa hoàn tác 10s, xuất Markdown/PDF qua share sheet); giữ nguyên UI; backend và mobile song song
- Q: Sửa transcript có tự chạy lại pipeline không? → A: Không; `PATCH /segments/:id` chỉ sửa và đặt `edited_at`; client hỏi người dùng rồi mới gọi `POST /reindex {scope}`; chi tiết trả `has_unprocessed_edits` để hiện nhãn "đang cập nhật"
- Q: Sửa đoạn được ở trạng thái nào? → A: `queued`, `ready`, `failed`; từ chối 409 khi `recording`/`paused` (đang ghi) và `processing` (pipeline đang đọc)
- Q: `reindex` có những phạm vi nào? → A: `changed` = sau khi sửa (ready) xử lý lại theo các seq đã sửa, hoặc sau lỗi (failed) chạy tiếp từ bước lỗi bỏ qua bước đã xong; `full` = chạy lại mọi bước; mỗi lần chạy tăng `meetings.pipeline_run` và jobId = `<meeting_id>-r<run>`
- Q: Xuất PDF ở server hay client? → A: Server dựng `markdown` hoặc `html`; client render PDF từ html bằng expo-print và chia sẻ qua share sheet
- Q: Tiêu đề rỗng khi PATCH? → A: Quay về tiêu đề mặc định theo `started_at` (US-25), không lưu chuỗi trắng
- Q: Khóa cài đặt tắt push? → A: `notification_settings.meeting_ready_push` (thiếu khóa = bật)
- Q: Repo chưa có EAS projectId để lấy Expo push token? → A: Mobile đọc projectId từ cấu hình; thiếu thì bỏ qua đăng ký kèm cảnh báo; người dùng tự chạy `eas init` để bật

## Session 2026-09-26 (Phase 12)
- Q: Nhiều khóa Gemini? → A: `GEMINI_API_KEY` nhận nhiều khóa cách nhau bằng dấu phẩy; xoay vòng lần lượt từng lời gọi (round-robin), bỏ qua khóa đang nghỉ; khóa không bao giờ vào log/DB (chỉ số thứ tự)
- Q: Khóa bị 429 nghỉ bao lâu? → A: Theo `retryDelay` Gemini trả về, mặc định 60 giây; lỗi hết hạn mức theo ngày thì nghỉ tới đầu ngày mới theo giờ Pacific; các mốc cấu hình được; mọi khóa đang nghỉ thì bước pipeline lỗi để retry theo backoff Phase 11
- Q: Ghi token cho embedding thế nào? → A: Gọi `countTokens` (miễn phí) để lấy số token thật, ghi `usage_records` và `meeting_chunks.token_count`; nếu model embedding từ chối `countTokens` thì dừng lại hỏi, không đoán số
- Q: Màn Tìm kiếm khi chưa có thực thể (Phase 13)? → A: Chip Transcript = kết quả ngữ nghĩa (chạm nhảy tới đoạn), chip Meeting = tìm theo tiêu đề; ẩn chip Node và nhóm Người tới Phase 13

## Session 2026-09-26 (Phase 13)
- Q: Phạm vi mobile khi các màn thực thể chưa có design? → A: Làm theo phong cách sẵn có — nối màn 10 với dữ liệu thật, thêm danh sách thực thể, chi tiết + dòng thời gian, duyệt gộp; mở chip Node + nhóm Người ở tab Tìm kiếm; lối vào qua "Xem chi tiết" ở màn 10 và tab Tìm kiếm
- Q: Chip lọc ở màn Knowledge Graph? → A: Tất cả / Người / Dự án / Chủ đề / Khác (tổ chức, sản phẩm, other gộp vào Khác); bỏ Task
- Q: Tầng khớp vector khi chưa hiệu chỉnh ngưỡng (OQ-03)? → A: Chỉ đề xuất gộp, không tự gộp; tự gắn chỉ khi tên chuẩn hóa trùng; ngưỡng là biến môi trường, bật tự gộp sau khi có bộ dữ liệu vàng
- Q: Cách gọi Gemini để trích xuất? → A: Gom 4 chunk mỗi lượt gọi; mọi thực thể/quan hệ phải trích dẫn chunk nguồn, trích dẫn sai thì loại
