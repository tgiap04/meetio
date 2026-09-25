# Phase 05 · Gateway transcript realtime

**Liên kết:** [plan.md](plan.md) · [US-14](../../user_stories.md#us-14--không-mất-dữ-liệu-khi-mạng-chập-chờn) ·
[Luồng 1](../../docs/system-architecture.md#2-luồng-1--ghi-và-nhận-diện-thời-gian-thực) · [api-spec §8](../../docs/api-spec.md#8-websocket)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ✅ xong · **Phụ thuộc:** Phase 04

Kênh WebSocket nhận từng đoạn transcript, ghi bền vững rồi mới xác nhận.

## Nhận định then chốt
- **Thứ tự là tất cả:** ghi vào PostgreSQL xong mới phát `segment_ack`. Ack trước rồi mới ghi thì
  client xóa hàng đợi local trong khi dữ liệu chưa an toàn — đúng cái lỗi mà bản đặc tả gốc mắc phải.
- Nguồn sự thật là `transcript_segments` trong PostgreSQL, không phải Redis, không phải bộ nhớ client.
- Upsert theo `(meeting_id, seq)` làm cho việc gửi lại vô hại. Client cứ gửi bao nhiêu lần cũng được.
- Client **không bao giờ** gửi lại toàn bộ transcript lúc kết thúc — điều bản đặc tả gốc yêu cầu và
  là nguồn mâu thuẫn dữ liệu.

## Yêu cầu
**Chức năng:** namespace `/meeting-room`; xác thực lúc bắt tay; kiểm tra quyền sở hữu khi vào room;
nhận đoạn transcript, ghi bền vững, xác nhận; phát trạng thái xử lý và tín hiệu hoàn tất.
**Phi chức năng:** ack trong 500ms; chịu được 120 sự kiện/phút/cuộc họp; kết nối lại không mất đoạn.

## Kiến trúc
Socket.io gateway trong NestJS. JWT xác thực ở middleware bắt tay. `join_meeting` kiểm tra quyền sở
hữu lần nữa — không dựa vào việc client trung thực.

Ghi theo lô nhỏ: gom các đoạn đến trong cửa sổ 200ms rồi ghi một lần, nhưng ack vẫn phát theo từng
`seq`. Giảm số lượt ghi mà không hy sinh tính đúng đắn của cơ chế xác nhận.

## File liên quan
**Tạo:** `apps/api/src/realtime/meeting.gateway.ts` · `realtime/ws-auth.middleware.ts` ·
`realtime/segment-writer.service.ts` (gom lô + upsert) · `realtime/events.ts`
**Sửa:** `packages/shared/src/ws-events.ts` · `apps/api/src/meetings/meetings.service.ts` (đếm segment chờ)

## Các bước thực hiện
1. Middleware bắt tay: xác thực JWT, từ chối kết nối không có token hợp lệ.
2. `join_meeting`: kiểm tra `meeting.user_id`, vào room theo `meeting_id`.
3. `transcript_segment`: đưa vào bộ gom lô; ghi upsert theo `(meeting_id, seq)`; ghi xong phát
   `segment_ack{seq}` cho đúng client đó.
4. Lỗi ghi → phát `segment_error{seq, code}`; client giữ lại trong hàng đợi và gửi lại.
5. `POST /meetings/:id/segments/bulk` — đường dự phòng REST cho đồng bộ bù, dùng chung tầng upsert.
6. Phát `processing_status` và `meeting_ready` vào room khi tác vụ nền báo về (Phase 11 nối vào).
7. Cập nhật `meetings.last_activity_at` mỗi khi có đoạn mới — nuôi tác vụ tự đóng ở Phase 04.
8. Test tải: 20 cuộc họp đồng thời, mỗi cuộc 2 đoạn/giây, trong 10 phút.

## Todo
- [x] Middleware xác thực bắt tay
- [x] join_meeting kiểm tra quyền sở hữu
- [x] Bộ gom lô + upsert theo (meeting_id, seq)
- [x] segment_ack phát sau khi ghi bền vững
- [x] segment_error + đường gửi lại
- [x] Endpoint bulk dùng chung tầng upsert
- [x] Phát processing_status / meeting_ready (notifier sẵn sàng, Phase 11 sẽ nối)
- [x] Test tải 20 cuộc họp đồng thời

## Chuẩn hoàn thành
- Gửi cùng một `seq` 10 lần chỉ sinh đúng một dòng.
- Kill kết nối giữa chừng rồi nối lại, gửi bù: không mất đoạn nào, không trùng đoạn nào.
- Ack luôn đến sau khi dữ liệu đã có trong PostgreSQL — chứng minh bằng test tiêm lỗi.
- Test tải giữ độ trễ ack dưới 500ms ở phân vị 95.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Gom lô làm ack chậm quá ngưỡng | Cửa sổ 200ms là cấu hình; đo rồi chỉnh, không hardcode |
| Đoạn đến không đúng thứ tự khi gửi bù | Upsert theo `seq` nên thứ tự đến không quan trọng; sắp xếp lúc đọc |
| Rò rỉ kết nối WebSocket | Dọn room khi ngắt kết nối; đặt hạn kết nối nhàn rỗi |

## Bảo mật
Không ghi log nội dung `text` của đoạn transcript ở production ([NFR-04](../../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)).
Chỉ log `meeting_id`, `seq` và độ dài.

## Sai lệch so với kế hoạch
- Rate limiter dùng fixed-window Redis, không slide window — để đơn giản hóa implement.
- `POST /meetings/:id/segments/bulk` sống ở `MeetingsModule`, chia sẻ tầng upsert với WS.
- `processing_status` và `meeting_ready` notification chỉ cung cấp `MeetingRoomNotifier` làm lớp emit — Phase 11 sẽ gắn processor jobs vào trigger chúng.
- WebSocket loại bỏ `speaker_label` từ `TranscriptSegmentPayload` (US-13 đã bỏ theo clarifications).
- Load test 20 meetings × 2 seg/s × 10 min: p95 ack 253ms, toàn bộ 24000/24000 acked, 0 lỗi, 0 trùng/mất.

## Tiếp theo
Mở khóa Phase 07 (ghi âm phía client, nhưng chưa chạy vì Phase 00 chưa đóng) và Phase 09 (dịch song song).
