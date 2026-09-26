# Phase 12: chunking, embedding & tìm kiếm ngữ nghĩa

**Ngày:** 2026-09-26
**Trạng thái:** đã implement, **chưa kiểm với Gemini thật** — `GEMINI_API_KEY` trống, `gemini:check` chưa chạy.
Cổng evidence dừng ở REWORK (8/10) chỉ vì hai mục unproven đó; commit theo yêu cầu người dùng.

## Đã làm

- Bước `chunk` (~800 token, overlap 15%, ưu tiên cắt ở khoảng lặng) và `embed` (lô 20, `countTokens` cho số
  token thật, chuẩn hóa L2, 768 chiều) là hai bước pipeline riêng. Migration 015: embedding/token_count
  nullable, `content_hash` unique theo cuộc họp.
- `GET /search` (60/phút/user), mobile nối API thật, nhảy tới đúng `seq` trong transcript; ẩn chip Node và
  nhóm Người tới Phase 13.
- `GEMINI_API_KEY` nhận nhiều khóa cách nhau dấu phẩy (yêu cầu người dùng): round-robin, 429 nghỉ theo
  `retryDelay` / 60s / tới nửa đêm Pacific nếu hết hạn mức ngày.
- Test: API 310 unit + 87 e2e + 5 schema, mobile 797.

## Quyết định đáng nhớ

- **Lượt `changed` giữ nguyên ranh giới chunk cũ** (`rechunkWithinRanges`). Chunk lại từ đầu thì sửa một chữ
  làm dời mọi ranh giới phía sau → mất hết embedding. Test tích hợp bắt được trước khi ship.
- **Reconcile theo `content_hash`**, không xóa-rồi-chèn: chunk không đổi giữ id, embedding và các mention
  trỏ tới nó; retry thành no-op.
- **Tìm chính xác theo user, không dùng HNSW** (`ORDER BY (embedding <=> q) + 0`). HNSW kèm lọc user trả về
  trang rỗng — budget quét tiêu vào vector của user khác và entry chết do reconcile. Đo: 41ms p95 @ 7.500
  chunk, ~300ms @ 50.000; ngân sách 2s.
- **Chỉ HTTP 400 `API_KEY_INVALID` mới loại khóa.** Bản đầu loại cả 403 `PERMISSION_DENIED` — mà Google trả
  status đó cho billing tắt, API chưa bật, IAM… Với một khóa, đó là tìm kiếm chết im lặng tới khi restart.
  Reviewer bắt được (tôi cũng nghi, nhưng chưa sửa trước khi review).
- **Ghi usage trước khi kiểm kích thước vector** — lượt gọi đã tính tiền dù kết quả dùng được hay không.

## Bãi mìn

- **Sweep `resumeStalled(now + 60s)` trong test quét cả DB dùng chung** → vớ cuộc họp của suite chunk-embed
  chạy song song, chạy `extract` trên đó. Đỏ khoảng 1/6 lượt; thoạt đầu tưởng server dev giành job (như
  Phase 11). Sửa: test lùi `updated_at` của chính cuộc họp mình về năm 2000.
- **Suite schema revert migration chạy đua với các suite DB khác**; `--runInBand` lại dính lỗi jest-runtime
  `reading 'identifier'` → `test` = unit (song song) → e2e (runInBand) → schema (một mình).
- Test hiệu năng seed 50k chunk vượt timeout Jest → chuyển thành script `perf:search`.
- Một lượt full đầu có test schema đỏ rồi xanh lại khi chạy riêng; không giữ được log để biết test nào.

## Bài học

- **Test do subagent viết vẫn phải đọc:** tester thêm test embed dùng meetingId `'test-meeting'` (không phải
  uuid) với DataSource chưa khởi tạo — "pass" vì ném lỗi sai lý do; vài test key pool tự gọi `disable()` rồi
  khẳng định key bị disable. Đã xóa/sửa.

## Việc còn mở

- Người dùng: điền `GEMINI_API_KEY`, chạy `yarn workspace @meetio/api gemini:check` → nhờ reviewer đổi sang
  SEALED.
- Phase 13–15: lượt reindex `changed` đặt mọi bước về pending — rẻ ở Phase 12 nhờ reconcile, sẽ tốn khi có
  extract/summarize.
- Phase 07/08 vẫn chờ số đo Phase 00; `eas init` cho push.
