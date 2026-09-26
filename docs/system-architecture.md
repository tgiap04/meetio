# Meetio — Kiến trúc hệ thống

**Cập nhật:** 2026-09-26  
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
chạy trên **hàng đợi BullMQ riêng của nó** — thử lại, đo tải và scale độc lập theo từng bước, không
chung một hàng đợi lớn.

```
queued
  │  job "meeting-processing" (jobId: <meeting>-r<run>)
  ▼
processing ─┬─ 1. Cắt đoạn (chunk) ── gộp transcript_segments thành chunk ~800 token ước lượng,
            │                         chồng lấn ~15%, ưu tiên cắt tại chỗ ngừng lời dài (≥ 2s)
            │                         thay vì giữa câu; giữ segment_start/end_seq để truy vết nguồn.
            │                         Ghi content_hash (sha256 start:end:content) — chạy lại sau khi
            │                         sửa transcript chỉ cắt lại đúng chunk bị đoạn sửa chạm tới
            │                         (rechunkWithinRanges), giữ nguyên id/embedding của chunk còn lại.
            │                         embedding và token_count để NULL ở bước này.
            │
            ├─ 2. Nhúng vector (embed) ── từng lô 20 chunk chưa có embedding → GeminiClient.embed
            │                             (RETRIEVAL_DOCUMENT) → meeting_chunks.embedding +
            │                             token_count (số token thật từ countTokens). Mỗi lô commit
            │                             riêng — thử lại chỉ tốn phần chưa xong, không nhúng lại cả
            │                             cuộc họp.
            │
            ├─ 3. Trích xuất (extract) ── 4 chunk chưa `extracted_at` mỗi lần gọi Gemini (nhãn
            │                             C1..C4 trong prompt), trả JSON { entities[], relations[] }
            │                             cho cả nhóm, bắt buộc đúng schema; sai schema thì thử lại
            │                             tối đa 2 lần (3 lượt gọi tổng) rồi bỏ qua cả nhóm — 4 chunk
            │                             đó ghi `extracted_at` với `extraction = NULL`, các chunk
            │                             khác không bị ảnh hưởng. Một lỗi Gemini/mạng không bị nuốt:
            │                             nó nổi lên để cả bước `extract` được BullMQ thử lại.
            │
            ├─ 4. Khớp thực thể (resolve) ── xem mục 5. Từng chunk một (không theo nhóm), giữ khóa
            │                                advisory theo người dùng suốt transaction ghi
            │
            └─ 5. Tóm tắt (summarize) ── toàn bộ transcript → tóm tắt điều hành + action items,
                                          mỗi ý bắt buộc kèm chunk nguồn
  │
  ▼
ready ─── processing_status(ready) qua WebSocket, rồi đúng một push "đã xử lý xong"
```

**Bước `extract` chỉ tin những gì tự nó chứng minh được.** Model chỉ được trích một thực thể vào
đúng những chunk nó tự khai (`entity.chunks`) — trích dẫn một nhãn không nằm trong nhóm bị bỏ qua.
Một quan hệ chỉ được giữ nếu cả `source` lẫn `target` khớp (theo tên đã chuẩn hóa) với một thực thể
model đã khai **trong đúng chunk** quan hệ đó trích dẫn; quan hệ tự trỏ vào chính nó (hai tên cùng
một thực thể, ví dụ "Bình" và "anh Bình") cũng bị loại. Đây là hàng rào chống rủi ro "LLM bịa quan
hệ" mà JSON schema của Gemini không tự chặn được.

Mỗi bước là một job riêng: `jobId = <meeting>-r<run>-<step>`. `run` tăng mỗi lần cuộc họp được
(re)queue (`meetings.pipeline_run`), nên một lượt chạy lại luôn là job mới — không bao giờ bị BullMQ
coi là trùng với job của lượt trước và âm thầm bỏ qua. Nguồn sự thật của tiến trình là
`processing_jobs` cộng với `meetings.status` trong PostgreSQL, không phải Redis — Redis chỉ mang
việc cần làm; mất Redis giữa chừng không làm mất chỗ đang xử lý tới đâu.

**Quy tắc thử lại:** mỗi bước tối đa 1 lần chạy + 3 lần thử lại (4 lần tổng), chờ tăng dần theo cấp
số nhân 2s → 8s → 32s giữa các lần, cộng timeout 10 phút mỗi lần chạy (bước bị huỷ qua `AbortSignal`
nếu quá giờ). Hết lượt thử thì bước đó và cả cuộc họp chuyển `failed`, kèm tên bước lỗi
(`failure_reason`) — transcript và các bước đã `succeeded` giữ nguyên, không phải làm lại từ đầu.

**Bước chưa có handler:** cuộc họp **dừng lại và giữ nguyên `processing`** ở đúng bước đó
(`processing_jobs.status = pending`) — không bao giờ báo `ready` giả khi vẫn còn bước chưa chạy.
Sweep `resume-stalled-pipelines` (mỗi 5 phút) quét lại mọi cuộc họp `processing` đứng yên quá 5 phút
và gọi lại `advance()`; khi bước đó có handler, cuộc họp tự chạy tiếp mà không cần can thiệp thủ
công. Sau phase 13 (`extract` + `resolve` đã có handler), bước duy nhất còn thiếu là **`summarize`**
— mọi cuộc họp hiện dừng đúng ở đó, chờ phase kế tiếp cắm handler vào registry
(`PipelineStepRegistry`, xem `apps/api/src/graph/graph.module.ts` để thấy `extract`/`resolve` đăng
ký theo đúng mẫu này).

**Chạy lại sau khi sửa transcript ([US-24](../user_stories.md#us-24--sửa-nội-dung-nhận-diện-sai),
[US-29](../user_stories.md#us-29--thử-lại-khi-xử-lý-thất-bại)):** `POST /reindex` có hai phạm vi —
`changed` chỉ xử lý lại phần bị đoạn sửa chạm tới (sau `pipeline_changed_since`) khi cuộc họp đang
`ready`, hoặc resume đúng bước lỗi (bỏ qua các bước đã `succeeded`) khi đang `failed`; `full` luôn
chạy lại cả 5 bước từ đầu. Chi tiết hợp đồng ở
[api-spec.md §3](api-spec.md#3-vòng-đời-cuộc-họp).

**Chi phí AI:** mọi lệnh gọi Gemini (nhúng, trích xuất, tóm tắt, tìm kiếm) đi qua `GeminiClient` —
kiểm tra hạn mức trước khi gọi, giới hạn số lệnh chạy đồng thời, thử lại khi gặp lỗi 429/5xx, rồi
ghi một dòng `usage_records` với đúng số token Gemini trả về. Người dùng chưa có
`monthly_token_budget` (NULL) thì chưa bị chặn — hạn mức cụ thể còn là câu hỏi mở
([OQ-04](../user_stories.md#5-câu-hỏi-còn-mở)). API Gemini không trả số token cho embedding, nên
`GeminiClient.embed` gọi `countTokens` (miễn phí) trên từng đoạn trước, cộng dồn số đó vào
`usage_records` và ghi lại y nguyên vào `meeting_chunks.token_count` — không phải số ước lượng.

**Nhiều khóa Gemini (key pool):** `GEMINI_API_KEY` nhận danh sách khóa phân tách bằng dấu phẩy,
dùng luân phiên (round-robin) qua `GeminiKeyPool` + `GeminiCallRunner`. Một khóa nhận lỗi 429 thì
"nghỉ" theo `retryDelay` Gemini trả về (mặc định `GEMINI_KEY_COOLDOWN_MS`, 60s) — hoặc tới nửa đêm
giờ Thái Bình Dương kế tiếp nếu lỗi là hạn mức *theo ngày* — rồi lệnh gọi chuyển ngay sang khóa
khác, không chờ. Chỉ lỗi HTTP 400 `API_KEY_INVALID` mới loại hẳn một khóa (tới khi restart); lỗi 403
(API chưa bật, billing tắt, hay khóa bị giới hạn) giữ nguyên khóa vì "restart-less drop" không sửa
được nguyên nhân đó, và trên cấu hình một khóa duy nhất sẽ gây mất dịch vụ âm thầm. Số khóa chỉ tăng
thêm hạn mức khi chúng thuộc các Google Cloud project khác nhau. `GEMINI_MAX_CONCURRENCY` (mặc định
4) giới hạn số lệnh gọi Gemini chạy đồng thời trên toàn bộ pool. Lỗi 5xx/mạng thử lại tối đa
`retries` lần với chờ tăng dần theo cấp số nhân; hết khóa dùng được hoặc hết lượt thử thì ném
`AiServiceUnavailableError` → `AI_SERVICE_UNAVAILABLE` (503). Chỉ số thứ tự khóa (1-based) được log,
không bao giờ log giá trị khóa. Thiếu `GEMINI_API_KEY` không chặn server khởi động — `GeminiClient`
tự báo "chưa cấu hình" và mọi lệnh gọi AI thất bại với `AI_SERVICE_UNAVAILABLE`, pipeline coi đó là
lỗi có thể thử lại.

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

**`GET /search` ([US-22](../user_stories.md#us-22--tìm-kiếm-ngữ-nghĩa-xuyên-các-cuộc-họp)) là một
luồng riêng, đơn giản hơn** — không mở rộng qua đồ thị, không gọi LLM sinh câu trả lời: nhúng câu
hỏi rồi trả thẳng các chunk gần nhất của người dùng đó, có phân trang. Điểm khác biệt đáng chú ý:
`VectorRepository.searchChunks` quét **chính xác** (`ORDER BY (embedding <=> q) + 0`, cố tình cộng
`+ 0` để trình lập kế hoạch Postgres không chọn chỉ mục HNSW), chứ không đi qua chỉ mục HNSW gần
đúng như `findSimilarChunks`/`findSimilarEntities` dùng ở bước 2 phía trên. Lý do: một truy vấn
HNSW lọc thêm theo `user_id` sẽ đi lạc — bước walk HNSW trả về các vector gần nhất của **mọi**
người dùng trước, `WHERE user_id = …` mới lọc sau, nên với dữ liệu thưa (hoặc các entry chết do
việc cắt/nhúng lại chunk sau khi sửa transcript để lại, chờ `VACUUM`) một trang có thể **rỗng** dù
người dùng đó thực sự có chunk khớp — đã đo được ca này khi kiểm thử Phase 12. Quét chính xác qua
`idx_chunks_user` luôn đầy đủ, và đủ nhanh: 41 ms (p95) với 7.500 chunk, 300 ms (p95) với 50.000
chunk cho một người dùng — trong ngân sách < 2s
(chi tiết đo: `plans/reports/perf-2026-09-26-semantic-search.md`). Chỉ cân nhắc đổi cách (partition
theo người dùng, hay các tính năng lọc-trong-index mới của pgvector) nếu một người dùng vượt xa mốc
đó.

---

## 5. Khớp và gộp thực thể

Đồ thị dùng chung toàn tài khoản — "Dự án ABC" nhắc ở năm cuộc họp là **một** thực thể duy nhất.
Đây là khác biệt cốt lõi so với bản đặc tả cũ (đồ thị bị khóa theo từng cuộc họp, khiến GraphRAG
mất khả năng liên kết chéo, tức là mất đúng lý do người ta chọn GraphRAG).

Cái giá phải trả là bài toán khớp thực thể (`EntityResolver`, phase 13), xử lý ba tầng, tất cả nằm
trong bước `resolve` và chạy dưới một khóa duy nhất:

**Khóa theo người dùng.** Trước khi đọc hay ghi bất cứ gì vào đồ thị của một người dùng —
`resolve` cho từng chunk, `merge`/`undo`, `PATCH`/`DELETE /entities/:id`, và dọn thực thể mồ côi lúc
xóa cuộc họp — caller giữ `pg_advisory_xact_lock(hashtextextended('graph:' || user_id, 0))` suốt
transaction đó (`EntityResolver.lockUserGraph`). Vì mọi đường ghi đều xin cùng một khóa trước khi
chạm bảng `entities`, hai chunk của hai cuộc họp cùng nhắc "Bình" trong cùng một khắc không bao giờ
tạo ra hai thực thể trùng nhau — tier 1 bên dưới không cần transaction serializable, chỉ cần khóa
này tuần tự hóa hộ.

1. **Tier 1 — khớp chính xác.** Chuẩn hóa tên (bỏ dấu, thường hóa, bỏ kính ngữ dẫn đầu
   "anh/chị/ông/bà/em/cô/chú/bác/cậu/dì/thầy/sếp" — chỉ bỏ khi có tên theo sau, "Anh" một mình vẫn
   là một tên) thành `normalized_name`. Cùng `user_id` + `type`, trùng `normalized_name` **hoặc**
   khớp một phần tử của `normalized_aliases` thì gắn luôn vào thực thể đó — không cần gọi Gemini.
   Mô tả từ lần nhắc mới chỉ được ghi khi thực thể chưa có mô tả và chưa bị người dùng sửa
   (`is_user_edited = false`); người dùng đổi tên (`PATCH`) giữ tên cũ lại làm alias nên tier 1 vẫn
   nhận ra tên cũ ở lần nhắc sau.
2. **Tier 2 — khớp theo vector, chỉ đề xuất, không tự quyết.** Tên tier 1 không xử lý được thì nhúng
   (`gemini-embedding-001`, gộp `"tên — mô tả"` nếu có mô tả) và so cosine similarity với tối đa 3
   thực thể cùng `type` gần nhất (quét chính xác, không qua HNSW — cùng lý do "lọc theo user trước
   khi tìm gần đúng bị lạc" ở [§4](#4-luồng-3--truy-hồi-và-hỏi-đáp-graphrag)). Hai ngưỡng, cấu hình
   qua biến môi trường và đọc một lần lúc khởi động module:
   - `ENTITY_SUGGEST_THRESHOLD` (mặc định **0.85**) — từ ngưỡng này trở lên, tạo một dòng
     `entity_merge_suggestions` cho người dùng duyệt ở `GET /entities/merge-suggestions`
     ([US-40](../user_stories.md#us-40--gộp-các-thực-thể-bị-trùng)). Một cặp đã có trong bảng chặn
     `entity_merge_rejections` thì không được đề xuất lại.
   - `ENTITY_AUTO_MERGE_THRESHOLD` — **tắt (không đặt) theo mặc định**. Đặt một số trong `(0, 1]`
     mới bật tự động gắn tên mới làm alias của láng giềng gần nhất khi similarity đạt ngưỡng này,
     không cần người dùng duyệt. Cố ý tắt cho tới khi hiệu chỉnh trên dữ liệu thật — tự gộp sai làm
     hỏng đồ thị vĩnh viễn (không có "undo" cho một mention bị gắn nhầm entity, khác với undo một
     lần `merge` tường minh ở mục dưới). Giá trị đọc được ngoài `(0, 1]` (rỗng, chữ, ≤ 0, > 1) đều
     rơi về mặc định của biến đó, không phải lỗi khởi động.
   - Không tier nào nhận thì tạo thực thể mới, rồi so nó với tối đa 3 láng giềng để có thể sinh đề
     xuất tier 2 ngay từ lần nhắc đầu tiên.
3. **Người dùng quyết định** — gộp/tách/bác bỏ do người dùng chốt qua
   [api-spec.md §7](api-spec.md#7-đồ-thị-tri-thức), và quyết định đó là tối thượng: mọi thực thể đã
   `is_user_edited = true` (do `PATCH` hoặc do là bên `keep` của một lần `merge`) không bao giờ bị
   pipeline ghi đè tên/loại/alias nữa.

**Gộp và tách (`POST /entities/merge`, `.../undo`).** Gộp chuyển tên+alias của bên bị gộp thành
alias của bên giữ lại, chuyển hẳn mention/relation sang bên giữ lại, và xóa các quan hệ *giữa hai
bên* (nếu không sẽ thành self-loop) — snapshot đủ để dựng lại đúng những gì đã chuyển vào
`entity_merges.snapshot`. Tách lại (`undo`) chỉ được trong vòng 30 ngày, một lần, và chỉ khi bên bị
gộp chưa bị gộp tiếp vào nơi khác từ đó; mention thực thể giữ lại nhận thêm **sau** lần gộp không bị
trả lại. Chi tiết bảng ở [data-model.md §4](data-model.md#4-đồ-thị-tri-thức-phạm-vi-người-dùng).

**Dọn thực thể mồ côi.** Cuối mỗi lượt `resolve` (sau khi mọi chunk đã `resolved_at`) và mỗi khi xóa
một cuộc họp, thực thể không còn `entity_mention` nào tham chiếu và không phải `is_user_edited` bị
xóa hẳn — một chunk bị cắt lại (sửa transcript) hay bị xóa cùng cuộc họp không được để lại thực thể
chết không ai còn trỏ tới.

**Hiệu chỉnh ngưỡng ([OQ-03](../user_stories.md#5-câu-hỏi-còn-mở)).** `yarn workspace @meetio/api
graph:eval gold.json` (script `apps/api/scripts/entity-resolution-eval.ts`) chạy trên một tập cặp
tên đã gắn nhãn thật/giả bằng tay, dùng đúng model embedding của bước `resolve`: in ra, với các cặp
tier 1 không tự xử lý được, precision/recall/tỉ lệ gộp sai ở từng ngưỡng ứng viên. Mục tiêu phase 13:
precision > 85 %, tỉ lệ gộp sai < 5 %. Cần `GEMINI_API_KEY`; file gold và giá trị ngưỡng suy ra từ
đó không đi vào log.

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
