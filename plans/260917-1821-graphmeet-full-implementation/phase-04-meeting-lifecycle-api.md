# Phase 04 · API vòng đời cuộc họp

**Liên kết:** [plan.md](plan.md) · [US-07,09,16](../../user_stories.md#e2--ghi-âm--nhận-diện-giọng-nói) ·
[Vòng đời](../../docs/system-architecture.md#1-vòng-đời-cuộc-họp) · [api-spec §3](../../docs/api-spec.md#3-vòng-đời-cuộc-họp)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 03

Máy trạng thái cuộc họp và các endpoint REST điều khiển nó.

## Nhận định then chốt
- Cuộc họp được tạo **lúc bắt đầu**, không phải lúc kết thúc. Bản đặc tả gốc tạo ở thời điểm kết
  thúc, khiến `join_room` không có id để dùng — một mâu thuẫn không hiện thực hóa được.
- Máy trạng thái phải thực thi ở server, không tin vào client. Client gửi `end` hai lần thì lần thứ
  hai phải nhận `409 INVALID_STATE_TRANSITION`.
- Cuộc họp `recording` bị bỏ quên phải tự đóng sau 24 giờ, nếu không sẽ treo vĩnh viễn và không bao
  giờ được xử lý.

## Yêu cầu
**Chức năng:** tạo / tạm dừng / tiếp tục / kết thúc cuộc họp; đọc chi tiết; sửa tiêu đề và ngôn ngữ
đích; xóa cascade; tác vụ tự đóng cuộc họp bỏ quên.
**Phi chức năng:** mọi chuyển trạng thái là một giao dịch nguyên tử; `end` chỉ thành công khi mọi
segment đã bền vững.

## Kiến trúc
`MeetingsModule` với một `MeetingStateMachine` tách riêng giữ bảng chuyển trạng thái hợp lệ. Mọi
thay đổi trạng thái đi qua đúng một chỗ này — logic trạng thái rải rác là nguồn lỗi kinh điển.

`POST /meetings/:id/end` kiểm tra số segment còn chờ trước khi cho phép; còn chờ thì trả
`409 SEGMENTS_PENDING`. Chuyển `ended` xong thì đẩy việc vào hàng đợi (Phase 11 hiện thực, phase này
chỉ định nghĩa điểm móc).

## File liên quan
**Tạo:** `apps/api/src/meetings/meetings.module.ts` · `meetings.controller.ts` ·
`meetings.service.ts` · `meeting-state-machine.ts` · `meetings.repository.ts` ·
`dto/` · `apps/api/src/jobs/abandoned-meeting.job.ts`
**Sửa:** `packages/shared/src/meeting.ts` (kiểu và enum trạng thái)

## Các bước thực hiện
1. `MeetingStateMachine`: bảng chuyển trạng thái tường minh, chuyển sai thì ném lỗi.
2. `POST /meetings` — tạo ở trạng thái `recording`, trả `{id, status, started_at}`.
3. `pause` / `resume` — cập nhật `duration_sec` loại trừ thời gian tạm dừng.
4. `POST /meetings/:id/end` — kiểm tra segment chờ → `ended` → `queued` → móc vào hàng đợi.
5. `GET /meetings/:id` — metadata, tóm tắt, action items, trạng thái xử lý (không kèm segment).
6. `PATCH` sửa tiêu đề và `translate_to`; `DELETE` xóa cascade theo quy tắc ở
   [mục 7](../../docs/data-model.md#7-quy-tắc-xóa) kèm xóa thực thể mồ côi.
7. `GET /meetings` phân trang con trỏ, lọc theo `q`, `from`, `to`, `status`.
8. Tác vụ định kỳ: cuộc họp `recording` có `last_activity_at` quá 24 giờ → chuyển `ended`.

## Todo
- [ ] MeetingStateMachine + test bảng chuyển trạng thái
- [ ] POST /meetings (tạo lúc bắt đầu)
- [ ] pause / resume + tính thời lượng
- [ ] end + kiểm tra segment chờ + móc hàng đợi
- [ ] GET chi tiết / PATCH / DELETE cascade
- [ ] GET danh sách phân trang con trỏ
- [ ] Tác vụ tự đóng cuộc họp bỏ quên
- [ ] Test xóa thực thể mồ côi

## Chuẩn hoàn thành
- Mọi endpoint ở [api-spec §3](../../docs/api-spec.md#3-vòng-đời-cuộc-họp) đúng đặc tả.
- Chuyển trạng thái không hợp lệ luôn trả `409`, không bao giờ âm thầm bỏ qua.
- Xóa cuộc họp dọn sạch bảng con; thực thể còn dùng ở cuộc họp khác vẫn nguyên.
- Cuộc họp bỏ quên 24 giờ được tác vụ tự đóng.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Đua trạng thái khi client gửi `end` nhiều lần | Khóa mức dòng khi chuyển trạng thái; thao tác idempotent |
| Xóa cascade bỏ sót bảng mới thêm sau này | Test đếm dòng chạy quét mọi bảng, không liệt kê tay |

## Bảo mật
Mọi endpoint đi qua `ScopedRepository` của Phase 03. Không endpoint nào nhận `user_id` từ body —
chỉ lấy từ token.

## Tiếp theo
Mở khóa Phase 05 (gateway realtime), Phase 10 (quản lý cuộc họp), Phase 11 (hạ tầng tác vụ).
