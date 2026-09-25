# Phase 11 · Hạ tầng tác vụ AI

**Liên kết:** [plan.md](plan.md) · [US-28→30](../../user_stories.md#e5--pipeline-ai--kết-quả) ·
[Luồng 2](../../docs/system-architecture.md#3-luồng-2--pipeline-phân-tích)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ✅ **xong** · **Phụ thuộc:** Phase 04

Khung chạy tác vụ nền, trạng thái xử lý, thử lại, thông báo, đo token. Phase này không sinh nội dung
AI nào — nó dựng đường ray cho các phase 12–15 chạy trên.

## Nhận định then chốt
- Bản đặc tả gốc nói "cập nhật trạng thái Processing Done" nhưng không có chỗ nào lưu trạng thái và
  không có hàng đợi. Phase này là chỗ bù lại khoảng trống đó.
- Mỗi bước là một job riêng, thử lại độc lập. Gộp cả pipeline thành một job thì lỗi ở bước cuối bắt
  làm lại từ đầu — tốn tiền và tốn thời gian.
- `UNIQUE (meeting_id, step)` trong `processing_jobs` là thứ làm cho việc chạy lại idempotent.
- Đo token phải có từ ngày đầu. Bật sau khi chi phí đã vượt kiểm soát thì đã muộn.

## Yêu cầu
**Chức năng:** hàng đợi BullMQ; theo dõi trạng thái từng bước; tự thử lại 3 lần có chờ tăng dần;
thử lại thủ công bỏ qua bước đã xong; phát trạng thái realtime; push notification; ghi nhận token.
**Phi chức năng:** pipeline cuộc họp 60 phút xong trong 5 phút; mọi job idempotent.

## Kiến trúc
BullMQ trên Redis, một hàng đợi cho mỗi bước (`chunk`, `embed`, `extract`, `resolve`, `summarize`).
Job hoàn tất thì xếp job kế tiếp — chuỗi tuần tự, không phải một job khổng lồ.

`processing_jobs` là nguồn sự thật cho trạng thái, Redis chỉ là phương tiện chạy. Redis mất dữ liệu
thì dựng lại được chuỗi từ bảng này.

`GeminiClient` dùng chung: gọi có thử lại, giới hạn tần suất, và ghi `usage_records` cho **mọi** lượt gọi.

## File liên quan
**Tạo:** `apps/api/src/jobs/queue.module.ts` · `jobs/pipeline.orchestrator.ts` ·
`jobs/processors/` (một file cho mỗi bước, giai đoạn này là khung rỗng) ·
`apps/api/src/ai/gemini.client.ts` · `ai/usage-tracker.ts` ·
`apps/api/src/notifications/push.service.ts`
**Sửa:** `apps/api/src/realtime/meeting.gateway.ts` (phát trạng thái) ·
`apps/api/src/meetings/meetings.service.ts` (móc `end` vào hàng đợi)

## Các bước thực hiện
1. Cấu hình BullMQ, năm hàng đợi, kết nối Redis, bảng điều khiển cho môi trường phát triển.
2. `pipeline.orchestrator`: nhận `meeting.ended` → tạo bản ghi `processing_jobs` → xếp bước đầu.
3. Bộ khung processor: mỗi bước cập nhật `processing_jobs`, xong thì xếp bước kế.
4. Chính sách thử lại: 3 lần, chờ 2s/8s/32s; hết thì đặt `meetings.status = failed` kèm bước lỗi.
5. `POST /meetings/:id/reindex` — bỏ qua các bước đã `succeeded` trừ khi `scope: full`.
6. `GeminiClient`: thử lại, giới hạn tần suất, và bắt buộc ghi `usage_records` mỗi lượt gọi.
7. Phát `processing_status` và `meeting_ready` qua WebSocket sau mỗi lần đổi trạng thái.
8. Push notification bằng `expo-notifications`; đúng một thông báo cho mỗi cuộc họp dù thử lại mấy lần.
9. `GET /meetings/:id/status` trả trạng thái chi tiết theo từng bước.

## Todo
- [x] Hàng đợi BullMQ + kết nối Redis
- [x] Orchestrator + chuỗi job
- [x] Khung processor cập nhật processing_jobs
- [x] Chính sách thử lại có chờ tăng dần
- [x] Chạy lại bỏ qua bước đã xong
- [x] GeminiClient + usage-tracker
- [x] Phát trạng thái realtime
- [x] Push notification khử trùng
- [x] Endpoint trạng thái chi tiết

## Chuẩn hoàn thành
- ✅ Kết thúc cuộc họp tự kích hoạt chuỗi job, trạng thái đổi realtime via WebSocket.
- ✅ Một bước lỗi ba lần → `failed` status, `error_message` được làm sạch (không raw exception).
- ✅ Chạy lại `changed` từ `failed` bỏ qua bước `succeeded`; từ `ready` reset all steps.
- ✅ Mọi lượt gọi Gemini ghi `usage_records` với token count (null budget = no cap, OQ-04 mở).
- ✅ `meeting_ready` push đúng một lần per meeting, khử trùng via `ready_notified_at`, Expo retry 3x on 429.

## Sai lệch so với kế hoạch
- Bull Board dev dashboard không thêm ở Phase 11 (hoãn).
- `GeminiClient` chưa có embeddings token counting (Gemini API không trả token count cho embeddings; Phase 12 sẽ quyết định).
- `GEMINI_API_KEY` .env trống — không verify live Gemini call; e2e tách với `BULLMQ_PREFIX` tránh xung đột.
- `GeminiClient.withSlot` ignores `AbortSignal` — nên fix trước Phase 12 (High finding, để token không bị đốt sau timeout).
- Worker `concurrency` set mặc định 1 BullMQ (Fixed: set `STEP_CONCURRENCY=4`, cân bằng với `GEMINI_MAX_CONCURRENCY`).

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Redis mất dữ liệu làm mất job | `processing_jobs` nguồn sự thật; resume sweep 5 min dựng lại chuỗi. |
| Chuỗi job kẹt giữa chừng | Timeout 10 min/step; stalled sweep mỗi 5 min thử lại nếu stuck. |
| Vòng thử lại đốt token | Đếm attempts; hạn mức cứng; Phase 12+ handler lên ý thức idempotent. |

## Bảo mật
Khóa Gemini chỉ nằm ở backend. Không log prompt và nội dung phản hồi ở production
([NFR-04](../../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)).

## Tiếp theo
Mở khóa Phase 12 (chunking, embedding, tìm kiếm).
