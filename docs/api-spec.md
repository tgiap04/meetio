# Meetio — Đặc tả API

**Base URL:** `/api` · **Xác thực:** Bearer JWT trên mọi endpoint trừ mục 1  
**Cập nhật:** 2026-09-17  
**Liên quan:** [User Stories](../user_stories.md) · [Kiến trúc](system-architecture.md) · [Mô hình dữ liệu](data-model.md)

---

## 0. Qui ước chung

- Định dạng: JSON. Thời gian theo ISO 8601 có múi giờ.
- Phân trang theo con trỏ: `?limit=20&cursor=<opaque>`; phản hồi trả `next_cursor` (null nếu hết).
- Truy cập tài nguyên không thuộc sở hữu trả **404**, không trả 403 — tránh lộ sự tồn tại của tài nguyên
  ([US-03](../user_stories.md#us-03--chỉ-truy-cập-được-dữ-liệu-của-chính-mình)).
- Mọi phản hồi lỗi cùng một khuôn:

```json
{ "error": { "code": "MEETING_NOT_FOUND", "message": "Không tìm thấy cuộc họp", "details": {} } }
```

**Đã sửa so với bản đặc tả cũ:** tên sự kiện WebSocket trước đây mâu thuẫn giữa phần luồng dữ liệu
(`new_transcript_chunk`, `translated_chunk`) và phần đặc tả giao tiếp (`send_transcript`,
`receive_translation`). Tài liệu này là nguồn duy nhất — tên ở mục 8 là tên chính thức.

---

## 1. Xác thực

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/auth/register` | Đăng ký. Body `{email, password, display_name}` → `{access_token, refresh_token, user}` |
| POST | `/auth/login` | Đăng nhập. Body `{email, password}` → như trên |
| POST | `/auth/refresh` | Body `{refresh_token}` → cặp token mới, thu hồi token cũ |
| POST | `/auth/logout` | Thu hồi refresh token của thiết bị hiện tại |

Access token sống 15 phút, refresh token 60 ngày và xoay vòng mỗi lần dùng.

---

## 2. Tài khoản

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/users/me` | Hồ sơ, cài đặt lưu trữ, **cài đặt thông báo**, mức tiêu thụ tháng hiện tại |
| PATCH | `/users/me` | Sửa `display_name`, `retention_days`, cài đặt thông báo |
| POST | `/users/me/consent` | Ghi nhận mốc đồng ý ghi âm ([US-04](../user_stories.md#us-04--thông-báo-và-ghi-nhận-sự-đồng-ý-ghi-âm)) |
| DELETE | `/users/me` | Body `{password}`. Đặt `deleted_at`, xóa vật lý sau 30 ngày |

`GET /users/me` **phải** trả `notification_settings` cùng với hồ sơ. Bản trước cho `PATCH` ghi cài
đặt thông báo nhưng không có đường đọc lại — màn hình cài đặt buộc phải đoán giá trị mặc định thay
vì hiển thị đúng thứ server đang giữ. Mọi trường `PATCH` sửa được thì `GET` phải đọc lại được.

---

## 3. Vòng đời cuộc họp

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/meetings` | **Tạo lúc bắt đầu họp.** Body `{title?, source_language, translate_to?}` → `{id, status:"recording", started_at}` |
| POST | `/meetings/:id/pause` | `recording` → `paused` |
| POST | `/meetings/:id/resume` | `paused` → `recording` |
| POST | `/meetings/:id/end` | Chỉ thành công khi mọi segment đã đồng bộ. `ended` → `queued`, kích hoạt pipeline |
| GET | `/meetings` | Danh sách phân trang. Lọc: `?q=`, `?from=`, `?to=`, `?status=` |
| GET | `/meetings/:id` | Chi tiết: metadata, tóm tắt, action items, trạng thái xử lý (không kèm segments) |
| PATCH | `/meetings/:id` | Sửa `title`, `translate_to` |
| DELETE | `/meetings/:id` | Xóa cascade ([US-26](../user_stories.md#us-26--xóa-cuộc-họp)) |
| GET | `/meetings/:id/status` | Trạng thái xử lý chi tiết theo từng bước |
| POST | `/meetings/:id/reindex` | Chạy lại pipeline. Body `{scope: "changed"\|"full"}` |
| GET | `/meetings/:id/export` | `?format=markdown\|pdf&include=summary,actions,transcript,translation` |

`POST /meetings` trả về `meeting_id` **trước khi** client bật mic. Bản đặc tả cũ tạo bản ghi ở
thời điểm kết thúc, khiến sự kiện `join_room` không có id để dùng — xem
[vòng đời cuộc họp](system-architecture.md#1-vòng-đời-cuộc-họp).

---

## 4. Transcript

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/meetings/:id/segments` | Phân trang theo `seq`. `?from_seq=&limit=` |
| PATCH | `/segments/:id` | Sửa `text` hoặc `speaker_label`. Đặt `is_edited = true` |
| POST | `/meetings/:id/segments/bulk` | Đồng bộ bù khi mất mạng. Body `{segments: [{seq, text, started_at_ms, ended_at_ms, speaker_label?}]}` — upsert theo `(meeting_id, seq)`, idempotent |

`bulk` là đường dự phòng khi WebSocket không dùng được; đường chính vẫn là kênh realtime ở mục 8.

---

## 5. Kết quả AI

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/meetings/:id/summary` | `{summary, citations[]}` |
| GET | `/meetings/:id/actions` | Action items của một cuộc họp |
| GET | `/actions` | Tổng hợp mọi cuộc họp. `?status=open&assignee_entity_id=` ([US-34](../user_stories.md#us-34--xem-việc-cần-làm-của-mình-xuyên-các-cuộc-họp)) |
| POST | `/meetings/:id/actions` | Thêm action item thủ công |
| PATCH | `/actions/:id` | Sửa nội dung, người phụ trách, hạn, trạng thái |
| DELETE | `/actions/:id` | |

---

## 6. Tìm kiếm và hỏi đáp

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/search` | Tìm ngữ nghĩa xuyên cuộc họp. `?q=&from=&to=&limit=` → các đoạn khớp kèm ngữ cảnh ([US-22](../user_stories.md#us-22--tìm-kiếm-ngữ-nghĩa-xuyên-các-cuộc-họp)) |
| POST | `/meetings/:id/qa` | Hỏi trong một cuộc họp. Body `{question}` |
| POST | `/qa` | Hỏi xuyên cuộc họp. Body `{question, from?, to?, entity_id?}` |
| GET | `/meetings/:id/qa` | Lịch sử hỏi đáp của cuộc họp |
| DELETE | `/meetings/:id/qa` | Xóa lịch sử hỏi đáp |

**Khuôn phản hồi hỏi đáp:**

```json
{
  "answer": "Anh Bình nhận phần tích hợp thanh toán, hạn cuối tuần sau.",
  "citations": [
    { "chunk_id": "…", "meeting_id": "…", "meeting_title": "Họp sprint 12",
      "meeting_date": "2026-09-15", "excerpt": "…", "segment_seq": 142 }
  ],
  "confidence": 0.86,
  "tokens_used": 3120
}
```

`citations` không bao giờ được rỗng khi `confidence` từ trung bình trở lên. Không tìm được ngữ cảnh
đủ liên quan thì trả `answer` nói rõ là không tìm thấy, `citations: []` và `confidence: 0` — chứ
không gọi LLM để nó bịa ([US-36](../user_stories.md#us-36--câu-trả-lời-luôn-kèm-nguồn-trích-dẫn)).

---

## 7. Đồ thị tri thức

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/entities` | `?type=&q=&limit=` — thực thể của người dùng |
| GET | `/entities/:id` | Chi tiết kèm quan hệ và các cuộc họp đã nhắc |
| GET | `/entities/:id/timeline` | Dòng thời gian các lần được nhắc ([US-39](../user_stories.md#us-39--theo-dõi-một-thực-thể-qua-thời-gian)) |
| PATCH | `/entities/:id` | Sửa `canonical_name`, `type`. Đặt `is_user_edited = true` |
| DELETE | `/entities/:id` | Xóa thực thể và các quan hệ gắn với nó |
| GET | `/entities/merge-suggestions` | Các cặp nghi trùng chờ người dùng duyệt |
| POST | `/entities/merge` | Body `{keep_id, merge_ids[]}` — gộp, tên cũ thành alias |
| POST | `/entities/merge/:id/undo` | Tách lại, trong vòng 30 ngày |
| POST | `/entities/merge-suggestions/:id/reject` | Ghi vào bảng chặn, không đề xuất lại |

---

## 8. WebSocket

**Namespace:** `/meeting-room` · Xác thực bằng JWT lúc bắt tay.

### Client → Server

| Sự kiện | Payload | Ghi chú |
|---------|---------|---------|
| `join_meeting` | `{meeting_id}` | Kiểm tra quyền sở hữu trước khi cho vào room |
| `transcript_segment` | `{seq, text, started_at_ms, ended_at_ms, speaker_label?, gap_before_ms?}` | Một đoạn đã chốt |
| `leave_meeting` | `{meeting_id}` | |

### Server → Client

| Sự kiện | Payload | Ghi chú |
|---------|---------|---------|
| `segment_ack` | `{seq}` | Phát **sau khi** đã ghi bền vững. Client nhận được mới xóa khỏi hàng đợi local |
| `segment_translated` | `{seq, translated_text, translated_to}` | Chỉ khi bật dịch |
| `segment_error` | `{seq, code, message}` | Client giữ lại trong hàng đợi và gửi lại |
| `processing_status` | `{meeting_id, status, step?, progress?}` | Cập nhật tiến trình pipeline ([US-28](../user_stories.md#us-28--thấy-rõ-trạng-thái-xử-lý)) |
| `meeting_ready` | `{meeting_id}` | Phân tích hoàn tất |

Thứ tự `segment_ack` là điểm mấu chốt của việc chống mất dữ liệu: server phải ghi xong vào
PostgreSQL rồi mới phát ack. Ack sớm rồi mới ghi thì client sẽ xóa hàng đợi local trong khi dữ liệu
chưa thực sự an toàn.

---

## 9. Mã lỗi

| Mã | HTTP | Khi nào |
|----|------|---------|
| `VALIDATION_ERROR` | 400 | Body hoặc query không hợp lệ. `details` chứa lỗi theo từng field |
| `UNAUTHORIZED` | 401 | Thiếu hoặc sai token |
| `TOKEN_EXPIRED` | 401 | Access token hết hạn — client tự refresh |
| `MEETING_NOT_FOUND` | 404 | Cuộc họp không tồn tại **hoặc** không thuộc sở hữu |
| `NOT_FOUND` | 404 | Tài nguyên khác không tồn tại, hoặc route không khớp. **Mặc định cho mọi 404 chưa phân loại** |
| `INVALID_STATE_TRANSITION` | 409 | Ví dụ gọi `end` trên cuộc họp đã `ended` |
| `SEGMENTS_PENDING` | 409 | Gọi `end` khi còn segment chưa đồng bộ |
| `MEETING_NOT_READY` | 409 | Hỏi đáp trên cuộc họp chưa xử lý xong |
| `PROCESSING_FAILED` | 422 | Pipeline lỗi, kèm `details.step` |
| `QUOTA_EXCEEDED` | 429 | Vượt hạn mức token tháng ([NFR-07](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)) |
| `RATE_LIMITED` | 429 | Quá tần suất cho phép |
| `AI_SERVICE_UNAVAILABLE` | 503 | Nhà cung cấp AI lỗi — có thể thử lại |
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước. **Mặc định cho mọi lỗi chưa phân loại** |

**Quy tắc mã mặc định.** Mã theo miền nghiệp vụ (`MEETING_NOT_FOUND`, `PROCESSING_FAILED`,
`SEGMENTS_PENDING`…) chỉ được phát khi tầng nghiệp vụ **chủ động** ném ra. Bộ lọc ngoại lệ toàn cục
không bao giờ được đoán mã theo miền từ HTTP status — 404 chưa phân loại là `NOT_FOUND`, không phải
`MEETING_NOT_FOUND`; lỗi chưa phân loại là `INTERNAL_ERROR`, không phải `PROCESSING_FAILED`.
Đoán sai mã khiến client đi nhầm nhánh xử lý: báo "pipeline lỗi" trong khi thực ra server sập.

---

## 10. Giới hạn tần suất

| Nhóm | Hạn mức |
|------|---------|
| `/auth/*` | 10 lần / phút / IP |
| Hỏi đáp (`/qa`, `/meetings/:id/qa`) | 30 lần / giờ / người dùng |
| `/search` | 60 lần / phút / người dùng |
| WebSocket `transcript_segment` | 120 sự kiện / phút / cuộc họp |
| Còn lại | 300 lần / phút / người dùng |
