# Phase 11 · Hạ tầng tác vụ AI

**Liên kết:** [plan.md](plan.md) · [US-28→30](../../user_stories.md#e5--pipeline-ai--kết-quả) ·
[Luồng 2](../../docs/system-architecture.md#3-luồng-2--pipeline-phân-tích)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 04

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
- [ ] Hàng đợi BullMQ + kết nối Redis
- [ ] Orchestrator + chuỗi job
- [ ] Khung processor cập nhật processing_jobs
- [ ] Chính sách thử lại có chờ tăng dần
- [ ] Chạy lại bỏ qua bước đã xong
- [ ] GeminiClient + usage-tracker
- [ ] Phát trạng thái realtime
- [ ] Push notification khử trùng
- [ ] Endpoint trạng thái chi tiết

## Chuẩn hoàn thành
- Kết thúc cuộc họp tự kích hoạt chuỗi job, trạng thái đổi realtime trên app.
- Một bước lỗi ba lần thì cuộc họp thành `failed` và nêu đúng tên bước.
- Chạy lại chỉ xử lý bước chưa xong — kiểm bằng `processing_jobs`.
- Mọi lượt gọi Gemini đều sinh một dòng `usage_records` có số token.
- Chỉ nhận đúng một push notification cho mỗi cuộc họp, kể cả khi thử lại.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Redis mất dữ liệu làm mất job | `processing_jobs` là nguồn sự thật; có tác vụ quét dựng lại chuỗi |
| Chuỗi job kẹt giữa chừng | Đặt hạn thời gian mỗi bước; quá hạn thì đánh dấu lỗi để thử lại |
| Vòng thử lại đốt token | Đếm số lần thử; lỗi do vượt hạn mức thì không thử lại |

## Bảo mật
Khóa Gemini chỉ nằm ở backend. Không log prompt và nội dung phản hồi ở production
([NFR-04](../../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)).

## Tiếp theo
Mở khóa Phase 12 (chunking, embedding, tìm kiếm).
