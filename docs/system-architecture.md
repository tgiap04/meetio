# GraphMeet — Kiến trúc hệ thống

**Cập nhật:** 2026-09-17  
**Liên quan:** [User Stories](../user_stories.md) · [Mô hình dữ liệu](data-model.md) · [Đặc tả API](api-spec.md)

---

## 0. Thành phần

| Tầng | Công nghệ | Trách nhiệm |
|------|-----------|-------------|
| Mobile | Expo / React Native | Ghi âm, nhận diện giọng nói trên thiết bị, hàng đợi ngoại tuyến, toàn bộ giao diện |
| API | NestJS (Node.js) | REST, WebSocket, xác thực, phân quyền theo chủ sở hữu |
| Hàng đợi | BullMQ trên Redis | Tác vụ nền: cắt đoạn, nhúng vector, trích xuất đồ thị, tóm tắt |
| Dữ liệu | PostgreSQL + pgvector | Bản ghi cuộc họp, transcript, vector, đồ thị tri thức |
| Bộ nhớ đệm | Redis | Bộ đệm phiên ghi đang chạy, khử trùng lặp, giới hạn tần suất |
| AI | Google Gemini API | Nhúng vector, dịch, trích xuất thực thể, tóm tắt, sinh câu trả lời |

**Nguyên tắc bất biến:** audio không bao giờ rời khỏi thiết bị. Backend chỉ nhận văn bản. Đây là
cam kết ở [NFR-02](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr) và là ranh giới quyết định
toàn bộ thiết kế bên dưới.

---

## 1. Vòng đời cuộc họp

```
                  POST /api/meetings
   [client]  ──────────────────────────►  recording
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │ pause                  │ resume                 │ end
                    ▼                        │                        ▼
                  paused ───────────────────►┘                      ended
                                                                      │ tự động
                                                                      ▼
                                                                   queued
                                                                      │ worker nhận
                                                                      ▼
                                                                 processing
                                                          ┌───────────┴───────────┐
                                                          ▼                       ▼
                                                        ready                  failed
                                                          ▲                       │
                                                          └───── thử lại ◄────────┘
```

**Điểm sửa so với bản đặc tả cũ:** bản ghi cuộc họp được tạo **lúc bắt đầu**, không phải lúc kết
thúc. Bản cũ chỉ tạo bản ghi ở `POST /meetings` khi họp xong, nhưng WebSocket lại cần `meeting_id`
để `join_room` ngay từ đầu — một mâu thuẫn không thể hiện thực hóa. Tạo bản ghi từ đầu đồng thời
mở đường cho việc phục hồi sau sự cố ([US-15](../user_stories.md#us-15--phục-hồi-cuộc-họp-sau-khi-app-đóng-đột-ngột)).

**Quy tắc chuyển trạng thái**
- `recording` quá 24 giờ không có hoạt động → worker tự chuyển `ended` (không để treo vĩnh viễn).
- `failed` giữ nguyên transcript. Chỉ các dẫn xuất AI bị đánh dấu chưa sẵn sàng.
- Sửa transcript ở trạng thái `ready` sẽ đưa cuộc họp về `queued` nhưng vẫn phục vụ được dữ liệu cũ.

---

## 2. Luồng 1 — Ghi và nhận diện thời gian thực

```
Thiết bị                                   Backend                          Postgres
────────────────────────────────────────────────────────────────────────────────────
Bắt đầu
  │ POST /api/meetings ─────────────────────► tạo bản ghi (recording) ──────► meetings
  │ ◄──────────────────────── meeting_id
  │
  │ WS join_meeting(meeting_id) ────────────► kiểm tra chủ sở hữu, vào room
  │
Bật engine nhận diện thiết bị
  │
  ├─ chốt một đoạn (seq=1) ─── ghi hàng đợi local ──┐
  │                                                 │
  │ WS transcript_segment{seq:1, text, ts} ────────►│ ghi transcript_segments ──► DB
  │ ◄───────── WS segment_ack{seq:1} ───────────────┘ (bền vững trước khi ack)
  │ xóa khỏi hàng đợi local
  │
  ├─ (nếu bật dịch) ─────────────────────────► gom lô → Gemini → dịch
  │ ◄───────── WS segment_translated{seq:1, text}
  │
Kết thúc
  │ đồng bộ nốt hàng đợi ────────────────────► mọi đoạn đã bền vững
  │ POST /api/meetings/:id/end ──────────────► ended → queued → đẩy vào hàng đợi việc
```

**Nguồn sự thật:** `transcript_segments` trong PostgreSQL. Không phải Redis, không phải bộ nhớ
client. Bản đặc tả cũ mâu thuẫn ở chỗ này — F3 nói gửi liên tục để chống mất dữ liệu, nhưng luồng
lại lưu tạm ở Redis rồi chờ client gửi trọn bộ transcript lúc kết thúc. Nếu client chết thì "bản
chống mất dữ liệu" cũng chết theo. Ở đây mỗi đoạn được ghi bền vững **trước khi** xác nhận, và
client không bao giờ gửi lại toàn bộ transcript.

**Chống mất dữ liệu ([US-14](../user_stories.md#us-14--không-mất-dữ-liệu-khi-mạng-chập-chờn))**
- `seq` tăng đơn điệu theo từng cuộc họp, do client cấp.
- Server ghi theo kiểu upsert trên `(meeting_id, seq)` → gửi lại nhiều lần vẫn an toàn.
- Client chỉ xóa khỏi hàng đợi local sau khi nhận `segment_ack`.
- Mất kết nối: hàng đợi tích lũy ở local; kết nối lại thì gửi bù theo đúng thứ tự `seq`.

**Khởi động lại engine nhận diện ([US-11](../user_stories.md#us-11--nhận-diện-liên-tục-suốt-cuộc-họp-dài))**
Engine trên thiết bị sẽ tự ngắt. Client phải bật lại ngay và ghi nhận mốc gián đoạn. Khoảng gián
đoạn hiển thị rõ trong transcript thay vì nối liền hai đoạn như chưa có chuyện gì xảy ra.

> **Rủi ro chưa được kiểm chứng ([OQ-01](../user_stories.md#5-câu-hỏi-còn-mở)):** giới hạn thực tế
> của nhận diện trên thiết bị với hội thoại dài. Phải chạy spike đo trước khi thi công E2. Nếu
> không đạt thì phải chuyển sang nhận diện đám mây, và nguyên tắc "audio không rời thiết bị" ở
> mục 0 sụp đổ — kéo theo thay đổi chính sách quyền riêng tư, mô hình chi phí và cả luồng này.

---

## 3. Luồng 2 — Pipeline phân tích

Kích hoạt khi cuộc họp chuyển `queued`. Chạy trong BullMQ, mỗi bước là một job riêng, thử lại độc lập.

```
queued
  │
  ├─ 1. Cắt đoạn ─────── gộp transcript_segments thành chunk ~800 token, chồng lấn 15%
  │                      giữ liên kết segment_start / segment_end để truy vết nguồn
  │
  ├─ 2. Nhúng vector ─── Gemini embedding theo lô → meeting_chunks.embedding
  │
  ├─ 3. Trích xuất ───── mỗi chunk → LLM trả JSON { entities[], relations[] }
  │                      bắt buộc đúng schema; sai schema thì thử lại tối đa 2 lần rồi bỏ chunk đó
  │
  ├─ 4. Khớp thực thể ── so trùng với thực thể sẵn có của người dùng (xem mục 5)
  │                      → tạo mới, hoặc gắn mention vào thực thể đã có
  │
  ├─ 5. Tóm tắt ──────── toàn bộ transcript → tóm tắt điều hành + action items
  │                      mỗi ý bắt buộc kèm chunk nguồn
  │
  └─ 6. Hoàn tất ─────── ready → thông báo qua WebSocket và push
```

**Quy tắc thử lại:** mỗi bước tối đa 3 lần, chờ tăng dần 2s/8s/32s. Hết 3 lần thì cuộc họp chuyển
`failed` kèm tên bước lỗi. Các bước đã xong được đánh dấu để lần chạy lại bỏ qua.

**Chạy lại sau khi sửa transcript ([US-24](../user_stories.md#us-24--sửa-nội-dung-nhận-diện-sai)):**
chỉ xử lý lại các chunk có chứa đoạn bị sửa, cộng thêm bước tóm tắt (vì tóm tắt phụ thuộc toàn cục).
Bản đặc tả cũ ghi "cập nhật lại Vector/Graph nếu cần" mà không định nghĩa "nếu cần" — thực tế
nghĩa là: chunk bị chạm thì làm lại, phần còn lại giữ nguyên.

---

## 4. Luồng 3 — Truy hồi và hỏi đáp (GraphRAG)

Bản đặc tả cũ hoàn toàn không mô tả luồng này, dù đây chính là tính năng khác biệt của sản phẩm.

```
Câu hỏi của người dùng
  │
  ├─ 1. Nhúng câu hỏi ──────────► vector truy vấn
  │
  ├─ 2. Tìm điểm neo (song song)
  │      ├─ tìm theo vector trên meeting_chunks  → top 10 đoạn
  │      └─ tìm theo vector trên entities        → top 5 thực thể
  │
  ├─ 3. Mở rộng trên đồ thị ────► từ các thực thể neo, đi 1 bậc quan hệ
  │                               lấy các chunk sinh ra những quan hệ đó
  │
  ├─ 4. Gom và xếp hạng ────────► hợp nhất chunk từ bước 2 và 3, khử trùng,
  │                               xếp lại theo độ liên quan, cắt còn ~6000 token
  │
  ├─ 5. Sinh câu trả lời ───────► LLM nhận: câu hỏi + ngữ cảnh + 5 lượt hội thoại gần nhất
  │                               bắt buộc trả về chunk_ids dùng làm trích dẫn
  │
  └─ 6. Trả về ─────────────────► { answer, citations[], confidence }
```

**Phạm vi truy vấn**
- Hỏi trong một cuộc họp ([US-35](../user_stories.md#us-35--hỏi-đáp-trong-một-cuộc-họp)): lọc theo `meeting_id`.
- Hỏi xuyên cuộc họp ([US-37](../user_stories.md#us-37--hỏi-đáp-xuyên-nhiều-cuộc-họp)): lọc theo `user_id`,
  tùy chọn thêm khoảng thời gian.
- **Mọi truy vấn đều lọc theo `user_id` ở tầng dữ liệu**, không dựa vào việc tầng ứng dụng nhớ lọc.

**Chống bịa đặt:** prompt bắt buộc chỉ trả lời trong phạm vi ngữ cảnh được cấp. Không có chunk nào
đủ độ tương đồng tối thiểu thì trả lời thẳng là không tìm thấy, không gọi LLM. Câu trả lời không
kèm được trích dẫn thì bị coi là độ tin cậy thấp và hiển thị kèm cảnh báo.

---

## 5. Khớp và gộp thực thể

Đồ thị dùng chung toàn tài khoản — "Dự án ABC" nhắc ở năm cuộc họp là **một** thực thể duy nhất.
Đây là khác biệt cốt lõi so với bản đặc tả cũ (đồ thị bị khóa theo từng cuộc họp, khiến GraphRAG
mất khả năng liên kết chéo, tức là mất đúng lý do người ta chọn GraphRAG).

Cái giá phải trả là bài toán khớp thực thể, xử lý ba tầng:

1. **Khớp chính xác** — chuẩn hóa tên (bỏ dấu, thường hóa, bỏ kính ngữ "anh/chị/ông/bà"), trùng
   thì gắn luôn vào thực thể sẵn có.
2. **Khớp theo vector** — độ tương đồng cosine giữa embedding tên và mô tả. Trên ngưỡng cao thì
   tự gắn; nằm trong vùng ngưỡng giữa thì tạo bản ghi đề xuất gộp cho người dùng duyệt
   ([US-40](../user_stories.md#us-40--gộp-các-thực-thể-bị-trùng)).
3. **Người dùng quyết định** — gộp/tách/bác bỏ do người dùng chốt, và quyết định đó là tối thượng.
   Cặp đã bị bác bỏ ghi vào bảng chặn để không đề xuất lại.

Ngưỡng cụ thể là [OQ-03](../user_stories.md#5-câu-hỏi-còn-mở) — phải hiệu chỉnh trên dữ liệu thật,
không chốt bằng phỏng đoán.

---

## 6. Mô hình chi phí

Mỗi cuộc họp 60 phút, ước tính khoảng 9.000 từ:

| Bước | Số lần gọi | Ghi chú |
|------|-----------|---------|
| Dịch thời gian thực | ~180 lần (mỗi câu một lần) | Đắt nhất. Gom lô 3–5 câu để giảm còn ~50 |
| Nhúng chunk | ~15 | Rẻ, gom lô được |
| Trích xuất đồ thị | ~15 | Prompt dài, phải trả về JSON |
| Nhúng thực thể | ~30 | Gom lô |
| Tóm tắt | 1 | Ngữ cảnh dài |
| Hỏi đáp | tùy người dùng | 1 lần nhúng + 1 lần sinh cho mỗi câu hỏi |

Dịch song song là khoản chi lớn nhất và là tính năng tùy chọn — vì vậy nó tắt mặc định và có cảnh
báo chi phí khi bật ([US-17](../user_stories.md#us-17--bật-dịch-và-chọn-ngôn-ngữ-đích)).
Hạn mức theo người dùng ở [NFR-07](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr); mức cụ thể là [OQ-04](../user_stories.md#5-câu-hỏi-còn-mở).

---

## 7. Bảo mật

- Mọi endpoint (trừ đăng ký/đăng nhập) yêu cầu Bearer JWT.
- Phân quyền theo chủ sở hữu thực thi ở tầng truy vấn: mọi câu lệnh đều mang điều kiện `user_id`.
  Không tin vào việc tầng controller nhớ lọc.
- Truy cập tài nguyên không thuộc sở hữu trả `404`, không trả `403` — tránh lộ sự tồn tại của tài nguyên.
- WebSocket xác thực lúc bắt tay; `join_meeting` kiểm tra quyền sở hữu lần nữa.
- Không ghi log nội dung transcript, câu hỏi hay prompt ở production ([NFR-04](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)).
- Khóa API của dịch vụ AI chỉ nằm ở backend, không bao giờ nhúng vào app.
