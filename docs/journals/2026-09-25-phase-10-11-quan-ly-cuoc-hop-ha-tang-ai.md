# Phase 10–11: quản lý cuộc họp, xuất biên bản & hạ tầng tác vụ AI

**Ngày:** 2026-09-25 · **Commit:** `47e96f1`..`4613b09`
**Trạng thái:** xong. Phase 07/08 vẫn bị chặn — người dùng chọn giữ cổng Phase 00 thay vì làm trước với engine tạm.

## Đã làm

- **Phase 10:** đọc transcript theo `seq`, sửa đoạn (`edited_at`; chỉ ở `queued`/`ready`/`failed`), reindex có
  phạm vi, xuất Markdown/HTML (PDF render trên máy bằng expo-print), tiêu đề rỗng về mặc định. Mobile: Thư
  viện (FlatList cuộn vô hạn, tìm, lọc trạng thái + khoảng ngày), Chi tiết (trạng thái realtime, thử lại),
  Transcript (ảo hóa, sửa → hỏi chạy lại AI, tìm cả phần chưa tải), xóa hoàn tác 10s, xuất qua share sheet.
- **Phase 11 (đường ray):** một hàng đợi BullMQ mỗi bước, 1 + 3 lần thử (2s/8s/32s), timeout bước, sweep chạy
  tiếp 5 phút, `/status`, trạng thái realtime, push Expo một lần mỗi cuộc họp, `GeminiClient` + `usage_records`.
- Test: API 268 + 80 e2e, mobile 763 → 1111. Migration 014.

## Quyết định đáng nhớ

- **Bước chưa có handler thì dừng ở đó** — cuộc họp giữ `processing`. Phương án "coi như xong" cho demo đẹp
  nhưng biến `ready` thành lời nói dối và bắt Phase 12 chạy lại mọi cuộc họp.
- **Số `run` trên mỗi cuộc họp**, job id `<meeting>-r<run>[-<step>]`. Id cố định theo meeting (Phase 04) sẽ bị
  BullMQ nuốt khi thử lại; `run` còn cho mọi thao tác ghi kiểm "job này có thuộc lần chạy hiện tại không".
- **Mốc `pipeline_changed_since` chỉ đặt lúc reindex**, không lúc run bắt đầu — nếu không, chạy tiếp một run
  `changed` đã lỗi sẽ dời mốc và bỏ sót những đoạn sửa trước đó. Bắt được khi viết reindex, trước khi có bug.
- **Lõi pipeline không import Nest** — test tích hợp chạy engine + BullMQ worker thật trên Postgres/Redis trong
  Jest, né lỗi ESM đã biết khi nạp module graph của Nest.
- **Chỉ thông điệp lỗi "được viết cho người đọc"** (`ExplainedStepError`, timeout) vào `processing_jobs`; lỗi
  bất kỳ thành câu chung, stack vào log — `/status` trả về cho chủ cuộc họp.
- **Không làm embedding trong `GeminiClient`**: API Gemini không trả số token cho embedding, và yêu cầu là
  "mọi lượt gọi có số token". Ghi số ước đoán là giả; để Phase 12 quyết cách tính. Khóa trong `.env` trống nên
  không lời gọi thật nào được kiểm.

## Bãi mìn

- **Server dev của người dùng (`nest start --watch`) giành job của server test** — cùng Redis, cùng tên hàng
  đợi, và tự rebuild theo code đang sửa. Triệu chứng: cuộc họp vẫn tới `ready` nhưng log server test không hề
  có dòng nào của pipeline. Tìm ra bằng `Queue.getWorkers()`. Sửa: `BULLMQ_PREFIX` riêng cho mỗi lần chạy e2e.
  Trong lúc đó server dev có thể đã gửi push tới Expo thật cho vài token giả — vô hại, đã báo người dùng.
- **Tín hiệu hủy đã phát trước khi vào hàng chờ** làm lời gọi Gemini treo vĩnh viễn (listener `abort` không
  bao giờ chạy lại) — lộ ra khi viết test cho bản sửa của chính finding "không nghe AbortSignal".
- **Worker BullMQ mặc định concurrency 1** — giới hạn 4 lời gọi Gemini song song không bao giờ đạt tới.
- **Mobile, cả hai chỉ thấy khi đọc xuyên module** (test đều mock phần phụ thuộc): socket gửi lại token hết hạn
  mãi mãi; hủy push token chạy *sau* khi xóa token đăng nhập nên luôn 401 — máy đã đăng xuất vẫn nhận push.

## Bài học

- **Lý do "test chập chờn" không đủ để bỏ AC.** Implementer thay FlatList bằng ScrollView + nút "Tải thêm"
  vì Jest teardown — đi ngược US-20. Gửi lại: sửa bằng fake timers, FlatList giữ nguyên. Tương tự "design
  không có chỗ cho lọc ngày" — trong khi nút phễu ngay cạnh ô tìm đang để trơ.
- **Test "có tên" chưa chắc test điều nó nói:** tester viết "job bước sau là no-op khi cuộc họp bị xóa" nhưng
  không job nào chạy sau khi xóa → thay bằng test tích hợp xóa cuộc họp *trong lúc* handler đang chạy.
- **Báo cáo subagent tiếp tục cần kiểm lại** — tester ghi hai finding backend là "chưa xử lý" trong khi đã sửa.

## Việc còn mở

- Phase 12: đăng ký handler đầu tiên; cách tính token cho embedding; handler phải idempotent theo (bước, run)
  vì BullMQ có thể chạy lại job bị coi là treo.
- Người dùng: `eas init` để có projectId cho push; điền `GEMINI_API_KEY`.
- Hoãn: dashboard Bull Board cho dev (phase-11 bước 1); index `updated_at` cho các sweep.
- Chỉ máy thật kiểm được: push tới máy, font tiếng Việt trong PDF, độ mượt khi cuộn.
