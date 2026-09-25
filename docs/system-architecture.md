# Meetio — Kiến trúc hệ thống

**Cập nhật:** 2026-09-25  
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
- `recording` **hoặc** `paused` quá 24 giờ không có hoạt động → tác vụ định kỳ (quét mỗi 15 phút)
  tự chuyển `ended` rồi đẩy vào hàng đợi pipeline, giống hệt khi người dùng tự bấm kết thúc. "Không
  hoạt động" tính theo `last_activity_at` (mốc segment gần nhất, hoặc `started_at` nếu chưa có
  segment nào) — không phải theo giờ hiện tại, nên 24 giờ tạm dừng không tự động cộng dồn thành họp
  treo.
- Đẩy vào hàng đợi BullMQ luôn chạy **sau khi** transaction đổi trạng thái đã commit; job dùng
  `jobId = <meeting>-r<run>` (`meetings.pipeline_run`) nên idempotent trong cùng một lượt chạy, còn
  một lượt chạy lại là job mới thay vì bị BullMQ coi là trùng. Nếu Redis trục trặc đúng lúc đó, tác
  vụ định kỳ `requeue-stranded-meetings` (mỗi 15 phút) sẽ enqueue lại mọi cuộc họp `queued` bị kẹt
  quá 10 phút.
- `failed` giữ nguyên transcript. Chỉ các dẫn xuất AI bị đánh dấu chưa sẵn sàng.
- Sửa transcript **không** tự đưa cuộc họp về `queued` — `PATCH /segments/:id` chỉ sửa nội dung và
  đặt `edited_at`; cuộc họp `ready` vẫn phục vụ nguyên bản tóm tắt cũ cho tới khi client tự gọi
  `POST /reindex` (xem mục 3).

---

## 2. Luồng 1 — Ghi và nhận diện thời gian thực

**Bối cảnh dùng chính:** điện thoại đặt cạnh laptop đang họp trực tuyến, thu tiếng phát ra từ loa.
Người dùng chọn nguồn âm thanh (micro thiết bị hoặc thiết bị Bluetooth ngoài) và mức chất lượng ở
màn cài đặt ghi âm trước khi bắt đầu.

**Hệ quả kiến trúc:** âm thanh vào là một luồng trộn lẫn. Hệ thống **không** tách người nói và
**không** lưu trường người nói ở bất kỳ tầng nào — xem
[US-13](../user_stories.md#us-13--gán-nhãn-người-nói--đã-bỏ-2026-09-21). Transcript là một chuỗi
đoạn nối tiếp theo thời gian.

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

Máy chủ không ghi từng đoạn riêng lẻ: các đoạn đến trong cửa sổ ~200ms mỗi cuộc họp được gom lại
và ghi một lần (tối đa 500 đoạn/lô). `segment_ack` của một đoạn chỉ phát sau khi lô chứa nó đã
COMMIT — gộp lô đổi cách ghi, không đổi bảo đảm "ack sau khi bền vững" ở sơ đồ trên.

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

> **Rủi ro chưa được kiểm chứng ([OQ-01](../user_stories.md#5-câu-hỏi-còn-mở), [OQ-05](../user_stories.md#5-câu-hỏi-còn-mở)):**
> giới hạn thực tế của nhận diện trên thiết bị với hội thoại dài, **và** tỉ lệ nhận diện sai khi
> nguồn âm là loa laptop cách 30–50cm chứ không phải giọng nói trực tiếp. Phải chạy spike đo trước khi thi công E2. Nếu
> không đạt thì phải chuyển sang nhận diện đám mây, và nguyên tắc "audio không rời thiết bị" ở
> mục 0 sụp đổ — kéo theo thay đổi chính sách quyền riêng tư, mô hình chi phí và cả luồng này.
>
> Spike đang chạy tại [`spikes/stt-feasibility/`](../spikes/stt-feasibility/README.md) (code vứt
> đi, không nằm trong workspace yarn) — kết quả đo sẽ điền vào `REPORT.md` của thư mục đó khi có,
> chưa có số đo nào tại đây.

---

## 3. Luồng 2 — Pipeline phân tích

Kích hoạt khi cuộc họp chuyển `queued` (do `end`, do sweep tự đóng, hoặc do `reindex`). Mỗi bước
chạy trên **hàng đợi BullMQ riêng của nó** (`pipeline-chunk`, `pipeline-embed`, `pipeline-extract`,
`pipeline-resolve`, `pipeline-summarize`) — thử lại, đo tải và scale độc lập theo từng bước, không
chung một hàng đợi lớn.

```
queued
  │  job "meeting-processing" (jobId: <meeting>-r<run>)
  ▼
processing ─┬─ 1. Cắt đoạn ─────── gộp transcript_segments thành chunk ~800 token, chồng lấn 15%
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
            └─ 5. Tóm tắt ──────── toàn bộ transcript → tóm tắt điều hành + action items
                                   mỗi ý bắt buộc kèm chunk nguồn
  │
  ▼
ready ─── processing_status(ready) qua WebSocket, rồi đúng một push "đã xử lý xong"
```

Mỗi bước là một job riêng: `jobId = <meeting>-r<run>-<step>`. `run` tăng mỗi lần cuộc họp được
(re)queue (`meetings.pipeline_run`), nên một lượt chạy lại luôn là job mới — không bao giờ bị BullMQ
coi là trùng với job của lượt trước và âm thầm bỏ qua. Nguồn sự thật của tiến trình là
`processing_jobs` cộng với `meetings.status` trong PostgreSQL, không phải Redis — Redis chỉ mang
việc cần làm; mất Redis giữa chừng không làm mất chỗ đang xử lý tới đâu.

**Quy tắc thử lại:** mỗi bước tối đa 1 lần chạy + 3 lần thử lại (4 lần tổng), chờ tăng dần theo cấp
số nhân 2s → 8s → 32s giữa các lần, cộng timeout 10 phút mỗi lần chạy (bước bị huỷ qua `AbortSignal`
nếu quá giờ). Hết lượt thử thì bước đó và cả cuộc họp chuyển `failed`, kèm tên bước lỗi
(`failure_reason`) — transcript và các bước đã `succeeded` giữ nguyên, không phải làm lại từ đầu.

**Bước chưa có handler (Phase 12–14 mới cắm vào):** cuộc họp **dừng lại và giữ nguyên
`processing`** ở đúng bước đó (`processing_jobs.status = pending`) — không bao giờ báo `ready` giả
khi vẫn còn bước chưa chạy. Sweep `resume-stalled-pipelines` (mỗi 5 phút) quét lại mọi cuộc họp
`processing` đứng yên quá 5 phút và gọi lại `advance()`; khi bước đó có handler, cuộc họp tự chạy
tiếp mà không cần can thiệp thủ công.

**Chạy lại sau khi sửa transcript ([US-24](../user_stories.md#us-24--sửa-nội-dung-nhận-diện-sai),
[US-29](../user_stories.md#us-29--thử-lại-khi-xử-lý-thất-bại)):** `POST /reindex` có hai phạm vi —
`changed` chỉ xử lý lại phần bị đoạn sửa chạm tới (sau `pipeline_changed_since`) khi cuộc họp đang
`ready`, hoặc resume đúng bước lỗi (bỏ qua các bước đã `succeeded`) khi đang `failed`; `full` luôn
chạy lại cả 5 bước từ đầu. Chi tiết hợp đồng ở
[api-spec.md §3](api-spec.md#3-vòng-đời-cuộc-họp).

**Chi phí AI:** mọi lệnh gọi Gemini (nhúng, trích xuất, tóm tắt) đi qua `GeminiClient` — kiểm tra
hạn mức trước khi gọi, giới hạn số lệnh chạy đồng thời, thử lại khi gặp lỗi 429/5xx, rồi ghi một
dòng `usage_records` với đúng số token Gemini trả về. Người dùng chưa có `monthly_token_budget`
(NULL) thì chưa bị chặn — hạn mức cụ thể còn là câu hỏi mở
([OQ-04](../user_stories.md#5-câu-hỏi-còn-mở)). Nhúng vector (bước 2) chưa đi qua `GeminiClient`:
API Gemini không trả số token cho embedding, nên cách tính chi phí cho bước này để Phase 12 — nơi
gọi nó lần đầu — quyết định.

**Thông báo hoàn tất ([US-30](../user_stories.md#us-30--nhận-thông-báo-khi-phân-tích-xong)):** khi
lượt chạy hoàn tất, engine phát `processing_status(ready)` qua WebSocket rồi gọi thẳng
`MeetingReadyNotifier`. Cột `meetings.ready_notified_at` được claim bằng một UPDATE có điều kiện
duy nhất, nên dù thử lại hay chạy lại nhiều lần, push cũng chỉ gửi **đúng một lần** cho mỗi cuộc
họp. Nội dung push cố ý chung chung — không tiêu đề, không trích transcript, chỉ kèm `meeting_id`
để mở đúng màn hình — vì payload push đi qua máy chủ Expo, Apple và Google, còn nội dung cuộc họp là
dữ liệu cá nhân ([NFR-01](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)). Người dùng tắt được ở
`notification_settings.meeting_ready_push`; một push thất bại không bao giờ làm hỏng pipeline vừa
chạy xong.

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
