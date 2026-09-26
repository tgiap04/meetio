# Meetio — Đặc tả API

**Base URL:** `/api` · **Xác thực:** Bearer JWT trên mọi endpoint trừ mục 1  
**Cập nhật:** 2026-09-27  
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
| POST | `/auth/google` | Đăng nhập bằng Google. Body `{id_token}` → `{access_token, refresh_token, user}`. Liên kết tự động vào tài khoản mật khẩu cùng email **chỉ khi** `email_verified` là `true` |

Access token sống 15 phút, refresh token 60 ngày và xoay vòng mỗi lần dùng.

---

## 2. Tài khoản

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/users/me` | Hồ sơ, cài đặt lưu trữ, **cài đặt thông báo**, mức tiêu thụ tháng hiện tại |
| PATCH | `/users/me` | Sửa `display_name`, `retention_days`, cài đặt thông báo |
| POST | `/users/me/consent` | Ghi nhận mốc đồng ý ghi âm ([US-04](../user_stories.md#us-04--thông-báo-và-ghi-nhận-sự-đồng-ý-ghi-âm)) |
| DELETE | `/users/me` | Body `{password}` **hoặc** `{google_id_token}` — đúng một trong hai, tùy tài khoản có `password_hash` hay không. Đặt `deleted_at`, xóa vật lý sau 30 ngày |
| POST | `/users/me/push-tokens` | Đăng ký (hoặc làm mới) token push Expo của thiết bị này. Body `{token, platform: "ios"\|"android"}` → **204** |
| DELETE | `/users/me/push-tokens` | Ngừng nhận push trên thiết bị này (đăng xuất, hoặc tắt thông báo). Body `{token}` → **204** |

`GET /users/me` **phải** trả `notification_settings` cùng với hồ sơ. Bản trước cho `PATCH` ghi cài
đặt thông báo nhưng không có đường đọc lại — màn hình cài đặt buộc phải đoán giá trị mặc định thay
vì hiển thị đúng thứ server đang giữ. Mọi trường `PATCH` sửa được thì `GET` phải đọc lại được. Khóa
duy nhất trong `notification_settings` hiện có là `meeting_ready_push` — thiếu khóa nghĩa là **bật**
([US-30](../user_stories.md#us-30--nhận-thông-báo-khi-phân-tích-xong)).

`GET /users/me` trả thêm `usage: {used, budget, percent, warning}` — `used` là tổng token tiêu thụ
tháng hiện tại, `budget` là hạn mức (`null` = không giới hạn), `percent` là 0–100 hoặc `null` khi
không có hạn mức, `warning` là `true` khi đã dùng từ 80% hạn mức trở lên
([NFR-07](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)). `user.consent_required` (trong
`PublicUser`) là `true` khi người gọi chưa đồng ý với nội dung đồng ý **hiện hành** — phiên bản hiện
tại là **2** — dù đã từng đồng ý một bản cũ hơn.

`POST /users/me/consent` ghi `recording_consent_at = now()` và `consent_version` = phiên bản hiện
hành, rồi trả lại cả hai (`{recording_consent_at, consent_version}`).

`retention_days` (NULL = giữ vĩnh viễn) quyết định khi nào một cuộc họp bị xóa tự động: đúng
`retention_days` ngày sau khi cuộc họp **kết thúc** (`ended_at`), hoặc sau khi được **tạo** nếu
chưa từng kết thúc. 7 ngày trước khi xóa, người dùng nhận **một** push chung
("N cuộc họp sẽ bị xóa sau 7 ngày") — không nêu tên cuộc họp nào. Cuộc họp đang
`recording`/`paused` không bao giờ bị tác vụ này đụng tới. Chi tiết tác vụ:
[Kiến trúc §7](system-architecture.md#7-bảo-mật).

`DELETE /users/me` chọn credential theo **tài khoản**, không theo body: tài khoản có `password_hash`
(kể cả đã liên kết Google) dùng `password`; tài khoản chỉ-Google dùng `google_id_token` — server so
`sub` xác minh được với `users.google_sub` của chính người gọi. Gửi cả hai hoặc không gửi trường nào
đều là `VALIDATION_ERROR`.

`token` phải khớp mẫu `Expo(nent)?PushToken[...]` (Expo push token, lấy từ
`expo-notifications` `getExpoPushTokenAsync`). Một token = một thiết bị: `POST` dùng
`ON CONFLICT (token) DO UPDATE` nên nếu thiết bị này trước đó đăng nhập tài khoản khác, token sẽ
chuyển hẳn sang tài khoản đang đăng ký — tài khoản cũ không còn nhận thông báo trên máy đó nữa.
`DELETE` chỉ xóa token thuộc về chính người gọi.

---

## 3. Vòng đời cuộc họp

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/meetings` | **Tạo lúc bắt đầu họp.** Body `{title?, source_language, translate_to?, audio_source, recording_quality}` → `{id, status:"recording", started_at}` |
| POST | `/meetings/:id/pause` | `recording` → `paused` |
| POST | `/meetings/:id/resume` | `paused` → `recording` |
| POST | `/meetings/:id/end` | Body `{last_seq?}`. `recording`\|`paused` → `ended` → `queued`, kích hoạt pipeline |
| GET | `/meetings` | Danh sách phân trang. Lọc: `?q=`, `?from=`, `?to=` (theo `created_at`), `?status=` |
| GET | `/meetings/:id` | Chi tiết: metadata, tóm tắt, action items, trạng thái xử lý (không kèm segments) |
| PATCH | `/meetings/:id` | Sửa `title`, `translate_to` |
| DELETE | `/meetings/:id` | Xóa vật lý, cascade ([US-26](../user_stories.md#us-26--xóa-cuộc-họp)) |
| GET | `/meetings/:id/status` | Trạng thái xử lý chi tiết theo từng bước |
| POST | `/meetings/:id/reindex` | Chạy lại pipeline. Body `{scope: "changed"\|"full"}` |
| GET | `/meetings/:id/export` | `?format=markdown\|html&include=summary,actions,transcript,translation` |

`POST /meetings` trả về `meeting_id` **trước khi** client bật mic. Bản đặc tả cũ tạo bản ghi ở
thời điểm kết thúc, khiến sự kiện `join_room` không có id để dùng — xem
[vòng đời cuộc họp](system-architecture.md#1-vòng-đời-cuộc-họp).

`POST /meetings` trả **403** `CONSENT_REQUIRED` (`details: {consent_version}`) khi người gọi chưa
đồng ý với nội dung đồng ý hiện hành — kiểm tra ở tầng nghiệp vụ, không chỉ ở màn hình app
([NFR-01](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)).

`end` chỉ thành công khi seq `1..last_seq` đã nằm đủ trong PostgreSQL — server xả nốt hàng đợi
đang gom lô rồi mới đếm. Thiếu seq nào thì trả **409** `SEGMENTS_PENDING` kèm
`details: {missing_count, missing_seqs}` (`missing_seqs` liệt kê tối đa 100 seq nhỏ nhất còn
thiếu, `missing_count` là tổng số thực còn thiếu). Không gửi `last_seq` nghĩa là cuộc họp không có
đoạn transcript nào.

`pause` / `resume` / `end` cùng trả một khuôn `{id, status, duration_sec}`; `duration_sec` chỉ
khác `null` sau khi `end` và không tính thời gian tạm dừng.

`GET /meetings` trả `{items, next_cursor}`; `?limit=` từ 1 đến 100, mặc định 20.

`DELETE /meetings/:id` xóa vật lý ngay trong một transaction — không phải xóa mềm. DB cascade các
bảng con, đồng thời dọn luôn thực thể không còn được mention từ cuộc họp nào khác.

`PATCH /meetings/:id` với `title` là chuỗi rỗng (sau khi `trim()`) quay về tiêu đề mặc định theo
`started_at` (`Cuộc họp DD/MM HH:mm`, US-25) — server không bao giờ lưu tiêu đề rỗng.

`GET /meetings/:id/status` trả `{meeting_id, status, current_step, steps[], failure_reason,
has_unprocessed_edits}`. `steps[]` liệt kê cả 5 bước theo đúng thứ tự pipeline, mỗi bước kèm
`status` (`pending`\|`running`\|`succeeded`\|`failed`), `attempts`, `error_message`, `started_at`,
`finished_at`. `current_step` là bước đang chạy, hoặc bước vừa lỗi, hoặc bước tiếp theo chưa xong
khi cuộc họp còn `queued`/`processing`. `has_unprocessed_edits` báo transcript đã bị sửa sau lần
chạy gần nhất — client dùng để hiện nhãn "đang cập nhật" ở tóm tắt cũ.

`POST /meetings/:id/reindex` chỉ nhận khi cuộc họp đang `ready` hoặc `failed`, còn lại **409**
`INVALID_STATE_TRANSITION`. `scope: "changed"` trên `ready` chỉ xử lý lại các đoạn đã sửa từ lần
chạy trước — chưa sửa gì thì trả **400** `VALIDATION_ERROR` (`details.scope: "nothing_changed"`) vì
chạy lại một cuộc họp không đổi gì chỉ tốn tiền; trên `failed` thì tiếp tục (resume) từ đúng bước đã
lỗi, bỏ qua các bước đã xong. `scope: "full"` luôn chạy lại từ đầu. Mỗi lần chạy tăng
`meetings.pipeline_run`, dùng làm id hàng đợi — bản tóm tắt cũ vẫn đọc được trong lúc chờ.

`GET /meetings/:id` trả thêm `summary_insufficient` (true khi cuộc họp quá ngắn hoặc quá ít nội
dung để tóm tắt — bước `summarize` không gọi model, `summary` là câu cố định giải thích lý do thay
vì rỗng) và `action_items[]` theo đúng khuôn `MeetingActionItem` ở [§5](#5-kết-quả-ai).

---

## 4. Transcript

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/meetings/:id/segments` | Phân trang theo `seq`. `?from_seq=&limit=` |
| PATCH | `/segments/:id` | Sửa `text`. Đặt `is_edited = true` |
| POST | `/meetings/:id/segments/bulk` | Đồng bộ bù khi mất mạng. Body `{segments: [{seq, text, started_at_ms, ended_at_ms, gap_before_ms?}]}`, tối đa 1000 đoạn/lần — upsert theo `(meeting_id, seq)`, idempotent. Trả `{acked_seqs}` |

`bulk` là đường dự phòng khi WebSocket không dùng được; đường chính vẫn là kênh realtime ở mục 8.
Trùng `seq` với đoạn đã có thì giữ bản đầu, không ghi đè (tránh đè lên bản người dùng đã sửa tay) —
nhưng `acked_seqs` vẫn liệt kê seq đó, vì dữ liệu ở seq này đã bền vững dù là bản cũ hay mới.

`GET /meetings/:id/segments` trả `{items, next_from_seq}`, `items` sắp theo `seq` tăng dần.
`?limit=` từ 1 đến 500, mặc định 200; `next_from_seq` là `null` khi đã hết trang, ngược lại dùng
luôn giá trị đó cho `?from_seq=` của trang kế tiếp.

`PATCH /segments/:id` chỉ nhận khi cuộc họp đang `queued`, `ready` hoặc `failed`; đang
`recording`/`paused` (còn ghi) hoặc `processing` (pipeline đang đọc) trả **409**
`INVALID_STATE_TRANSITION`. Sửa xong chỉ đặt `is_edited = true` và `edited_at` — **không** tự chạy
lại pipeline; client tự hỏi người dùng rồi gọi `POST /meetings/:id/reindex` khi muốn cập nhật lại
tóm tắt ([US-24](../user_stories.md#us-24--sửa-nội-dung-nhận-diện-sai)).

---

## 5. Kết quả AI (Phase 14 — US-31→34)

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/meetings/:id/summary` | Tóm tắt có trích dẫn — `MeetingSummaryResponse` |
| GET | `/meetings/:id/actions` | Action items của một cuộc họp |
| POST | `/meetings/:id/actions` | Thêm action item thủ công (US-32) |
| GET | `/actions` | Tổng hợp mọi cuộc họp, phân trang — open trước, done sau (US-34) |
| GET | `/actions/filters` | Chip lọc (người phụ trách, cuộc họp) và tổng số việc mở |
| PATCH | `/actions/:id` | Sửa nội dung, người phụ trách, hạn, trạng thái |
| DELETE | `/actions/:id` | |

**`GET /meetings/:id/summary`** → `MeetingSummaryResponse`:

```json
{
  "meeting_id": "…",
  "summary": "• Điểm 1\n• Điểm 2\n\nQuyết định:\n• …",
  "insufficient": false,
  "points": [{ "kind": "point", "text": "…", "chunk_ids": ["…"], "segment_seq": 12 }],
  "decisions": [{ "kind": "decision", "text": "…", "chunk_ids": ["…"], "segment_seq": 40 }],
  "has_unprocessed_edits": false
}
```

`summary` là `null` cho tới khi bước `summarize` chạy xong lần đầu. `insufficient` là true khi cuộc
họp quá ngắn hoặc quá ít nội dung để tóm tắt (dưới 80 từ transcript, hoặc model không rút được điểm
hay quyết định nào) — khi đó `summary` là câu cố định giải thích lý do, `points`/`decisions` rỗng và
không action item nào được tạo cho lượt đó. `points`/`decisions` chính là `summary_citations` đã lọc
theo `kind`; mỗi dòng kèm `chunk_ids` (id thật của các chunk được trích) và `segment_seq` (seq
transcript của chunk được trích đầu tiên) để mở đúng chỗ trong transcript. `has_unprocessed_edits`
giống hệt trường cùng tên ở `GET /meetings/:id/status`. `:id` không thuộc về người gọi, không tồn
tại, hoặc không parse được thành UUID → **404** `MEETING_NOT_FOUND` (cả ba trường hợp như nhau,
[§0](#0-qui-ước-chung)).

**`GET /meetings/:id/actions`** → `{ items: MeetingActionItem[] }`, cùng khuôn `MeetingActionItem`
ở dưới nhưng không lặp lại tên/ngày cuộc họp (đã biết từ `:id`). Cùng luật 404 `MEETING_NOT_FOUND`
như `summary`.

**`MeetingActionItem`** (khuôn item dùng chung mọi endpoint action item):

```json
{
  "id": "…", "meeting_id": "…", "content": "Gửi bản demo cho khách hàng",
  "assignee_entity_id": "…", "assignee_name": "anh Bình",
  "due_date": "2026-10-02", "status": "open", "is_manual": false,
  "source_chunk_id": "…", "segment_seq": 87, "created_at": "…"
}
```

`assignee_name` là `null` khi transcript không nói rõ ai làm — không bao giờ đoán
([US-32](../user_stories.md#us-32--xem-danh-sách-việc-cần-làm)); nếu thực thể assignee đã bị gộp,
`assignee_entity_id`/`assignee_name` trả về của thực thể **giữ lại**. `is_manual` true nếu người
dùng tự thêm qua `POST`. `source_chunk_id`/`segment_seq` là `null` cho việc thủ công, hoặc cho việc
AI tạo mà chunk nguồn đã bị cắt lại từ đó (sửa transcript).

**`POST /meetings/:id/actions`** — body:

```json
{ "content": "…", "assignee_entity_id": null, "due_date": "2026-10-02" }
```

`content` bắt buộc, 1–500 ký tự. `assignee_entity_id`/`due_date` tùy chọn. `due_date` sai định dạng
(không phải `YYYY-MM-DD` hợp lệ) → **400** `VALIDATION_ERROR`. `assignee_entity_id` khác null phải
là một thực thể `person` **còn sống** của chính người gọi — thực thể của người khác, đã bị gộp
(`merged_into_id` khác null), hoặc không tồn tại → **404** `NOT_FOUND` ("Không tìm thấy người phụ
trách"). Cuộc họp không thuộc người gọi → **404** `MEETING_NOT_FOUND`. → trả về `MeetingActionItem`
vừa tạo (`is_manual: true`, `status: "open"`).

**`GET /actions?status=&assignee_entity_id=&meeting_id=&limit=&offset=`**
([US-34](../user_stories.md#us-34--xem-việc-cần-làm-của-mình-xuyên-các-cuộc-họp)):

| Tham số | Kiểu | Ràng buộc |
|---------|------|-----------|
| `status` | string | Tùy chọn, `open`\|`done` |
| `assignee_entity_id` | UUID | Tùy chọn — khớp cả khi thực thể đã bị gộp vào thực thể khác từ đó |
| `meeting_id` | UUID | Tùy chọn |
| `limit` | int | Tùy chọn, 1–100, mặc định 30 |
| `offset` | int | Tùy chọn, 0–10000, mặc định 0 |

→ `ActionListResponse`: `{ items: ActionListItem[], next_offset }` — `ActionListItem` là
`MeetingActionItem` cộng `meeting_title`, `meeting_date`. Sắp xếp: **mở trước, xong sau**
(`status = 'done'` xuống cuối), trong mỗi nhóm theo `due_date` tăng dần (không hạn xuống cuối), rồi
`created_at`, rồi `id`. `next_offset` là `null` khi hết trang, ngược lại dùng cho `?offset=` trang kế.

**`GET /actions/filters`** → `ActionFiltersResponse`:

```json
{
  "open_total": 12,
  "assignees": [{ "id": "…", "canonical_name": "anh Bình", "open_count": 5 }],
  "meetings": [{ "id": "…", "title": "Họp sprint 12", "started_at": "…", "open_count": 3 }]
}
```

`open_total` là tổng số việc **mở** của người gọi, không lọc gì (kể cả chưa có người phụ trách).
`assignees`/`meetings` chỉ liệt kê người/cuộc họp **đang có ít nhất một việc mở** — `assignees` xếp
theo `open_count` giảm dần, `meetings` xếp mới nhất trước (`started_at DESC NULLS LAST`, tối đa
100 dòng).

**`PATCH /actions/:id`** — body (không trường nào bắt buộc):

```json
{ "content": "…", "assignee_entity_id": null, "due_date": null, "status": "done" }
```

`null` ở `assignee_entity_id`/`due_date` **xóa** trường đó; trường vắng mặt (không gửi) giữ nguyên
giá trị cũ. Body rỗng (`{}`, hoặc mọi trường đều vắng mặt) là **no-op** — không sửa gì và **không**
đánh dấu `is_user_edited`. Bất kỳ trường nào thực sự được gửi (kể cả gửi lại đúng giá trị cũ, vì
server không so sánh giá trị cũ/mới) đều đặt `is_user_edited = true`, để một lượt `summarize` chạy
lại sau đó (transcript sửa, hoặc `reindex`) giữ nguyên việc này thay vì coi là AI item chưa ai đụng
tới. `assignee_entity_id` khác null phải là thực thể `person` còn sống của chính người gọi, cùng
luật 404 như `POST` ở trên. `due_date` sai định dạng → **400** `VALIDATION_ERROR`. `:id` không tồn
tại, không thuộc về người gọi, hoặc không parse được thành UUID → **404** `NOT_FOUND` (không phân
biệt ba trường hợp, cùng nguyên tắc [§0](#0-qui-ước-chung)).

**`DELETE /actions/:id`** → **204**. Cùng luật 404 như `PATCH`. Xóa một việc **do AI tạo**
(`is_manual: false`) còn ghi lại nội dung đã chuẩn hóa vào `action_item_dismissals` — một lượt
`summarize` chạy lại sau đó sẽ không tạo lại đúng việc đó, dù model lại rút ra y hệt nội dung. Xóa
một việc **thủ công** (`is_manual: true`) không ghi gì thêm — không phải AI tạo nên không có gì để
nhớ đừng tạo lại.

---

## 6. Tìm kiếm và hỏi đáp

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/search` | Tìm ngữ nghĩa xuyên cuộc họp của chính người gọi ([US-22](../user_stories.md#us-22--tìm-kiếm-ngữ-nghĩa-xuyên-các-cuộc-họp)) |
| POST | `/meetings/:id/qa` | Hỏi trong một cuộc họp. Body `{question}` |
| GET | `/meetings/:id/qa` | Lịch sử hỏi đáp của cuộc họp (mới nhất trước, phân trang bằng `before`) |
| DELETE | `/meetings/:id/qa` | Xóa lịch sử hỏi đáp của cuộc họp này (chỉ luồng này, không đụng luồng toàn cục) |
| POST | `/qa` | Hỏi xuyên cuộc họp. Body `{question, from?, to?, entity_id?}` |
| GET | `/qa` | Lịch sử hỏi đáp xuyên cuộc họp (luồng toàn cục) |
| DELETE | `/qa` | Xóa lịch sử hỏi đáp xuyên cuộc họp (chỉ luồng toàn cục) |

**`GET /search` — tham số:**

| Tham số | Kiểu | Ràng buộc |
|---------|------|-----------|
| `q` | string | Bắt buộc, 2–500 ký tự |
| `from` | ISO 8601 | Tùy chọn — cuộc họp bắt đầu từ lúc này |
| `to` | ISO 8601 | Tùy chọn — cuộc họp bắt đầu tới lúc này |
| `limit` | int | Tùy chọn, 1–50, mặc định 10 |
| `offset` | int | Tùy chọn, 0–200, mặc định 0 |

**Khuôn phản hồi:**

```json
{
  "items": [
    {
      "chunk_id": "…",
      "meeting_id": "…",
      "meeting_title": "Họp sprint 12",
      "meeting_date": "2026-09-15T09:00:00.000Z",
      "excerpt": "…",
      "segment_seq": 142,
      "segment_end_seq": 145,
      "score": 0.83
    }
  ],
  "next_offset": 10
}
```

`meeting_date` là `null` nếu cuộc họp chưa từng ghi nhận thời điểm bắt đầu. `score` là cosine
similarity trong khoảng `[0, 1]`, càng cao càng khớp. `next_offset` dùng làm `offset` cho trang kế
tiếp; `null` nghĩa là hết trang.

**Lỗi riêng của `/search`:** `QUOTA_EXCEEDED` (429) khi vượt hạn mức token, `AI_SERVICE_UNAVAILABLE`
(503) khi Gemini không dùng được để nhúng câu hỏi — xem [§9](#9-mã-lỗi). Tần suất bị giới hạn
60 lần/phút/người dùng ([§10](#10-giới-hạn-tần-suất)), vượt hạn mức trả `RATE_LIMITED` (429).

### Hỏi đáp — nội dung yêu cầu

**`POST /meetings/:id/qa`**

```json
{ "question": "Ai nhận phần tích hợp thanh toán?" }
```

`question`: bắt buộc, chuỗi 1–1000 ký tự, phải có ít nhất một ký tự không phải khoảng trắng — chuỗi
rỗng hoặc chỉ toàn khoảng trắng trả `VALIDATION_ERROR` (400). Cuộc họp phải thuộc về người gọi và đã
xử lý xong ít nhất một đoạn có embedding, nếu không trả `MEETING_NOT_READY` (409).

**`POST /qa`** — như trên, cộng thêm bộ lọc áp dụng cho câu hỏi này (không lưu làm mặc định cho câu sau):

```json
{ "question": "Deadline dự án nào gần nhất?", "from": "2026-09-01", "to": "2026-09-30", "entity_id": "…" }
```

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `question` | string | Như trên |
| `from` | ISO 8601 | Tùy chọn. Chỉ ngày (`YYYY-MM-DD`, không giờ) → cả ngày đó theo **giờ Việt Nam** (00:00:00 tới 23:59:59.999, UTC+7); có giờ thì lấy đúng thời điểm đó |
| `to` | ISO 8601 | Tùy chọn, cùng quy tắc — chỉ ngày → 23:59:59.999 giờ Việt Nam của ngày đó |
| `entity_id` | UUID | Tùy chọn — giới hạn ngữ cảnh vào một thực thể ([US-39](../user_stories.md#us-39--hỏi-đáp-về-một-thực-thể)) |

Chuỗi không đúng ISO 8601 trả `VALIDATION_ERROR` (400). `entity_id` không đúng định dạng UUID cũng
trả `VALIDATION_ERROR` (400); đúng định dạng nhưng không tồn tại, không thuộc người gọi, hoặc đã bị
gộp vào thực thể khác thì trả `NOT_FOUND` (404) — cùng quy tắc "tồn tại của người khác cũng là 404"
ở [§0](#0-qui-ước-chung).

### Hỏi đáp — khuôn phản hồi

`POST /meetings/:id/qa` và `POST /qa` đều trả **200** với cùng khuôn `AskResponse` — cặp tin nhắn vừa
ghi vào lịch sử:

```json
{
  "question": {
    "id": "…", "role": "user", "content": "Ai nhận phần tích hợp thanh toán?",
    "citations": [], "confidence": null, "not_found": false, "low_confidence": false,
    "filters": null, "created_at": "2026-09-26T10:00:00.000Z"
  },
  "answer": {
    "id": "…", "role": "assistant", "content": "Anh Bình nhận phần tích hợp thanh toán, hạn cuối tuần sau.",
    "citations": [
      { "chunk_id": "…", "meeting_id": "…", "meeting_title": "Họp sprint 12",
        "meeting_date": "2026-09-15T09:00:00.000Z", "segment_seq": 142,
        "excerpt": "…", "available": true }
    ],
    "confidence": 0.86, "not_found": false, "low_confidence": false,
    "filters": null, "created_at": "2026-09-26T10:00:01.000Z"
  }
}
```

`QaMessage` (dùng chung cho cả tin nhắn hỏi và trả lời, và cho lịch sử ở dưới):

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id`, `role`, `content`, `created_at` | — | `role` là `user` hoặc `assistant` |
| `citations` | `QaCitation[]` | Rỗng cho tin nhắn `user`; rỗng khi `assistant` trả "không tìm thấy" |
| `confidence` | number \| null | Chỉ có ở `assistant`: `0` khi không tìm thấy, ngược lại theo mức model tự báo (`high`→0.9, `medium`→0.6, `low`→0.3); nếu model không trích được citation hợp lệ thì bị hạ còn tối đa 0.3 dù tự báo cao hơn |
| `not_found` | boolean | Chỉ có ý nghĩa ở `assistant`: không có gì trong các cuộc họp trả lời được câu hỏi này — model không được gọi để đoán |
| `low_confidence` | boolean | Chỉ `assistant`, và chỉ khi `not_found` là false: `confidence < 0.5` → client nên hiển thị cảnh báo ([US-36](../user_stories.md#us-36--câu-trả-lời-luôn-kèm-nguồn-trích-dẫn)) |
| `filters` | `QaFilters \| null` | Chỉ đặt ở tin nhắn `user` của một câu hỏi `/qa` có kèm ít nhất một trong `from`/`to`/`entity_id`; `entity_name` là tên thực thể tại thời điểm hỏi |

`QaCitation`: `chunk_id`, `meeting_id`, `meeting_title`, `meeting_date` (ISO hoặc `null`), `segment_seq`
(chạm vào để mở transcript đúng chỗ), `excerpt` (tối đa 200 ký tự, thêm `…` nếu bị cắt), `available`
(`false` nếu đoạn trích đã không còn tồn tại — transcript bị sửa và cắt lại từ sau khi câu trả lời này
được lưu; tính lại mỗi lần đọc, không lưu cứng).

### Hỏi đáp — lịch sử

**`GET /meetings/:id/qa`** và **`GET /qa`** — tham số:

| Tham số | Kiểu | Ràng buộc |
|---|---|---|
| `before` | UUID | Tùy chọn — id một tin nhắn, tải các tin **cũ hơn** nó |
| `limit` | int | Tùy chọn, 1–100, mặc định 50 |

Trả **200** `QaHistoryResponse`:

```json
{ "items": [ /* QaMessage[], cũ nhất trước */ ], "next_before": "…" }
```

`items` là trang tin nhắn theo thứ tự cũ → mới; `next_before` truyền lại làm `before` để tải trang cũ
hơn tiếp theo, `null` khi đã hết. `GET /meetings/:id/qa` và `DELETE /meetings/:id/qa` đòi cuộc họp
thuộc về người gọi, nếu không trả `MEETING_NOT_FOUND` (404). `DELETE` trả **204**, không nội dung, và
mỗi luồng (một cuộc họp, hoặc luồng toàn cục `/qa`) xóa độc lập — xóa luồng này không đụng luồng kia.

### Hỏi đáp — lỗi riêng

Ngoài các mã dùng chung ở [§9](#9-mã-lỗi):

| Mã | HTTP | Route | Khi nào |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Cả hai `POST` | Câu hỏi rỗng/toàn khoảng trắng, hoặc `from`/`to`/`entity_id` sai định dạng |
| `MEETING_NOT_READY` | 409 | `POST /meetings/:id/qa` | Cuộc họp thuộc về người gọi nhưng chưa có đoạn nào xử lý xong (chưa có embedding) |
| `MEETING_NOT_FOUND` | 404 | 4 route theo `/meetings/:id/qa` | Cuộc họp không tồn tại hoặc không thuộc về người gọi |
| `NOT_FOUND` | 404 | `POST /qa` | `entity_id` không tồn tại, không thuộc người gọi, hoặc đã bị gộp |
| `RATE_LIMITED` | 429 | Cả hai `POST` | Quá 30 lần/giờ/người dùng ([§10](#10-giới-hạn-tần-suất)) — áp dụng riêng cho `POST`, không tính các route `GET`/`DELETE` |
| `QUOTA_EXCEEDED` | 429 | Cả hai `POST` | Vượt hạn mức token tháng |
| `AI_SERVICE_UNAVAILABLE` | 503 | Cả hai `POST` | Gemini không dùng được để nhúng câu hỏi hoặc sinh câu trả lời, hoặc model trả sai khuôn 3 lần liên tiếp |

---

## 7. Đồ thị tri thức

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/meetings/:id/graph` | Đồ thị (entities + relations) mà riêng cuộc họp này sinh ra (màn 10) |
| GET | `/entities` | `?type=&q=&limit=&offset=` — thực thể của người dùng |
| GET | `/entities/merge-suggestions` | Các cặp nghi trùng chờ người dùng duyệt |
| POST | `/entities/merge` | Body `{keep_id, merge_ids[]}` — gộp, tên cũ thành alias |
| POST | `/entities/merge/:id/undo` | Tách lại, trong vòng 30 ngày. `:id` là id **bản ghi gộp** (`entity_merges.id` trả về ở `merges[].id`), không phải id thực thể |
| POST | `/entities/merge-suggestions/:id/reject` | Ghi vào bảng chặn, không đề xuất lại |
| GET | `/entities/:id` | Chi tiết kèm quan hệ, các cuộc họp đã nhắc và lịch sử gộp còn tách được |
| GET | `/entities/:id/timeline` | Dòng thời gian các lần được nhắc ([US-39](../user_stories.md#us-39--theo-dõi-một-thực-thể-qua-thời-gian)) |
| PATCH | `/entities/:id` | Sửa `canonical_name`, `type`. Đặt `is_user_edited = true` |
| DELETE | `/entities/:id` | Xóa thực thể, các bản ghi đã gộp vào nó, và (cascade) mention/relation/suggestion liên quan |

Mọi `:id` thực thể không tồn tại, không thuộc về người gọi, hoặc không parse được thành UUID đều
trả **404** `NOT_FOUND` như nhau — không phân biệt "sai định dạng" với "không tìm thấy", tránh lộ
thêm thông tin (cùng nguyên tắc [§0](#0-qui-ước-chung)).

**`GET /entities` — tham số**

| Tham số | Kiểu | Ràng buộc |
|---------|------|-----------|
| `type` | string | Tùy chọn. Một giá trị hoặc danh sách phẩy, ví dụ `organization,product` (`person`\|`project`\|`organization`\|`topic`\|`product`\|`other`) |
| `q` | string | Tùy chọn, 1–100 ký tự. Khớp theo tên hoặc alias đã chuẩn hóa (bỏ dấu, không phân biệt hoa/thường) |
| `limit` | int | Tùy chọn, 1–100, mặc định 20 |
| `offset` | int | Tùy chọn, 0–10000, mặc định 0 |

→ `EntityListResponse`:

```json
{
  "items": [
    { "id": "…", "canonical_name": "Dự án ABC", "type": "project", "aliases": ["Project ABC"],
      "mention_count": 12, "meeting_count": 4, "last_mentioned_at": "2026-09-20T08:00:00.000Z" }
  ],
  "next_offset": 20
}
```

`next_offset` là `null` khi hết trang. `q` chuẩn hóa về chuỗi rỗng (ví dụ chỉ toàn `%`, `…`) trả
`items: []` ngay, không quét toàn bảng.

**`GET /entities/:id`** → `EntityDetail` (mở rộng `EntitySummary` ở trên):

```json
{
  "id": "…", "canonical_name": "…", "type": "person", "aliases": ["…"],
  "mention_count": 12, "meeting_count": 4, "last_mentioned_at": "…",
  "description": "…", "is_user_edited": false,
  "relations": [
    { "id": "…", "direction": "outgoing", "relationship": "phụ trách",
      "other": { "id": "…", "canonical_name": "Dự án ABC", "type": "project" },
      "confidence": 0.9, "meeting_id": "…", "meeting_title": "Họp sprint 12",
      "chunk_id": "…", "segment_seq": 142 }
  ],
  "meetings": [{ "id": "…", "title": "…", "started_at": "…", "mention_count": 3 }],
  "merges": [
    { "id": "…", "merged_entity_id": "…", "merged_name": "anh Bình",
      "merged_at": "2026-09-10T00:00:00.000Z", "undo_until": "2026-10-10T00:00:00.000Z" }
  ]
}
```

`relations` liệt kê tối đa 200 dòng, mới nhất theo cuộc họp trước; `direction: outgoing` nghĩa là
thực thể đang xem là `source` (`this → relationship → other`). `merges` chỉ liệt kê các lần gộp còn
trong hạn 30 ngày và chưa bị tách lại hay gộp tiếp — dùng `id` của mỗi dòng cho
`POST /entities/merge/:id/undo`.

**`GET /entities/:id/timeline?limit=&offset=`** (cùng ràng buộc `limit`/`offset` như `/entities`) →
`EntityTimelineResponse`:

```json
{
  "items": [
    { "meeting_id": "…", "meeting_title": "Họp sprint 12", "meeting_date": "2026-09-15T09:00:00.000Z",
      "chunk_id": "…", "segment_seq": 142, "surface_form": "anh Bình", "excerpt": "…" }
  ],
  "next_offset": null
}
```

Sắp xếp cuộc họp cũ nhất trước, rồi theo thứ tự transcript trong mỗi cuộc họp
([US-39](../user_stories.md#us-39--theo-dõi-một-thực-thể-qua-thời-gian)).

**`PATCH /entities/:id`** — body `{canonical_name?, type?}` (không trường nào bắt buộc) → `EntityDetail`.
Đổi tên giữ tên cũ làm alias; đổi `type` không đụng alias. Luôn đặt `is_user_edited = true` — từ đó
pipeline không bao giờ ghi đè `canonical_name`/`type`/alias của thực thể này nữa
([US-41](../user_stories.md#us-41--sửa-thực-thể-sai)).

**`DELETE /entities/:id`** → **204**. Xóa cả những thực thể đã bị gộp vào nó (`merged_into_id`) —
cascade DB xóa theo mention/relation/suggestion.

**`GET /entities/merge-suggestions`** → `MergeSuggestionsResponse`:

```json
{ "items": [{ "id": "…", "score": 0.87,
              "a": { "id": "…", "canonical_name": "Bình", "type": "person", "…": "EntitySummary" },
              "b": { "id": "…", "canonical_name": "anh Bình", "type": "person", "…": "EntitySummary" } }] }
```

Tối đa 50 đề xuất, điểm cao trước. `score` là cosine similarity `[0, 1]` giữa embedding tên+mô tả
của hai thực thể (mục 5, [OQ-03](../user_stories.md#5-câu-hỏi-còn-mở)).

**`POST /entities/merge-suggestions/:id/reject`** → **204**. `:id` là id đề xuất
(`entity_merge_suggestions.id`); ghi cặp vào bảng chặn nên vector tier không đề xuất lại cặp đó
([US-40](../user_stories.md#us-40--gộp-các-thực-thể-bị-trùng)).

**`POST /entities/merge`** — body:

```json
{ "keep_id": "…", "merge_ids": ["…", "…"] }
```

`merge_ids`: 1–20 phần tử, UUID, không trùng lặp, không chứa `keep_id`. Mọi id không phải thực thể
sống (đã bị gộp trước đó, không tồn tại, hoặc không thuộc người gọi) → **404** `NOT_FOUND`. Tên và
alias của các thực thể bị gộp chuyển thành alias của `keep_id`; con đã gộp vào chúng chuyển thẳng
sang `keep_id`. → `MergeEntitiesResponse`:

```json
{ "entity": { "…": "EntityDetail của keep_id sau khi gộp" },
  "merges": [{ "id": "…", "merged_entity_id": "…", "merged_name": "…", "merged_at": "…", "undo_until": "…" }] }
```

`merges` có đúng một dòng cho mỗi id trong `merge_ids` — dùng `id` của dòng tương ứng để tách riêng
lẻ qua `POST /entities/merge/:id/undo`.

**`POST /entities/merge/:id/undo`** — `:id` là id **bản ghi gộp** (không phải id thực thể) → `EntityDetail`
của thực thể `keep` sau khi tách. Chỉ những gì lần gộp đó di chuyển được trả lại; mention/relation
thực thể `keep` nhận thêm từ sau lần gộp vẫn ở lại với nó. **409** `INVALID_STATE_TRANSITION` khi:

| Điều kiện | Thông điệp |
|-----------|-----------|
| Đã quá 30 ngày kể từ lúc gộp | "Đã quá 30 ngày, không tách lại được" |
| Bản ghi gộp này đã được tách lại rồi | "Lần gộp này đã được tách lại" |
| Thực thể bị gộp đã bị gộp tiếp vào nơi khác từ đó | "Thực thể đã được gộp tiếp vào nơi khác" |

**`GET /meetings/:id/graph`** (màn 10) → `MeetingGraphResponse`:

```json
{
  "nodes": [{ "id": "…", "canonical_name": "Dự án ABC", "type": "project", "mention_count": 5 }],
  "edges": [{ "source_id": "…", "target_id": "…", "relationship": "phụ trách", "count": 2,
              "chunk_id": "…", "segment_seq": 87 }]
}
```

Chỉ gồm entity/relation mà **cuộc họp này** tạo mention/relation, không phải toàn bộ đồ thị của
người dùng. `edges[].count` là số lần cuộc họp này nói ra đúng quan hệ đó (nguồn/đích/tên quan hệ
giống hệt); `chunk_id`/`segment_seq` trích dẫn lần phát biểu đầu tiên. `:id` không thuộc về người
gọi hoặc không tồn tại → **404** `MEETING_NOT_FOUND` (khác `entities/*`, vì đây là id cuộc họp).

---

## 8. WebSocket

**Namespace:** `/meeting-room` · Xác thực bằng JWT lúc bắt tay.

Token gửi ở `handshake.auth.token` (chỗ dành riêng của socket.io), dự phòng header
`Authorization: Bearer` nếu client không dùng được `auth`. Bắt tay thất bại thì client nhận lỗi
kết nối với `err.data.code` là `UNAUTHORIZED` (thiếu hoặc sai token) hoặc `TOKEN_EXPIRED` (access
token hết hạn — refresh rồi kết nối lại), cùng cặp mã như phía REST.

### Client → Server

| Sự kiện | Payload | Ghi chú |
|---------|---------|---------|
| `join_meeting` | `{meeting_id}` | Kiểm tra quyền sở hữu trước khi cho vào room. Ack qua callback socket.io: `{ok:true}` hoặc `{ok:false,error:{code:"MEETING_NOT_FOUND",message}}` |
| `transcript_segment` | `{seq, text, started_at_ms, ended_at_ms, gap_before_ms?}` | Một đoạn đã chốt. Nhận ở `recording`/`paused`/`ended`/`queued`; trạng thái khác trả `segment_error` mã `INVALID_STATE_TRANSITION`. Không có trường người nói — xem [US-13](../user_stories.md#us-13--gán-nhãn-người-nói--đã-bỏ-2026-09-21) |
| `leave_meeting` | `{meeting_id}` | Ack qua callback: `{ok:true}` |

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

`segment_error.code` là một trong: `VALIDATION_ERROR` (payload sai hoặc gửi trước khi
`join_meeting`), `RATE_LIMITED` (quá 120 sự kiện/phút/cuộc họp — dùng `/segments/bulk` để gửi bù
thay vì dồn dập gửi lại qua socket), `INVALID_STATE_TRANSITION`, `MEETING_NOT_FOUND` (cuộc họp đã
bị xóa), `TOKEN_EXPIRED` (server chủ động ngắt kết nối, kèm cờ để client tự reconnect) hoặc
`INTERNAL_ERROR`.

---

## 9. Mã lỗi

| Mã | HTTP | Khi nào |
|----|------|---------|
| `VALIDATION_ERROR` | 400 | Body hoặc query không hợp lệ. `details` chứa lỗi theo từng field |
| `UNAUTHORIZED` | 401 | Thiếu hoặc sai token |
| `TOKEN_EXPIRED` | 401 | Access token hết hạn — client tự refresh |
| `GOOGLE_TOKEN_INVALID` | 401 | ID token Google sai chữ ký / `iss` / `aud` / `exp` / thiếu `sub` |
| `GOOGLE_EMAIL_UNVERIFIED` | 401 | Email trong ID token Google chưa được Google xác minh (`email_verified !== true`) |
| `CONSENT_REQUIRED` | 403 | `POST /meetings` khi chưa đồng ý nội dung đồng ý hiện hành. `details.consent_version` |
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

Lỗi không phải `HttpException` (ví dụ lỗi driver Postgres) luôn trả `message` là câu cố định "Lỗi
hệ thống, vui lòng thử lại sau" — chi tiết thật (SQL, tên bảng, stack) chỉ vào log server, không
bao giờ ra response.

---

## 10. Giới hạn tần suất

| Nhóm | Hạn mức |
|------|---------|
| `/auth/*` | 10 lần / phút / IP |
| Hỏi đáp — chỉ `POST /qa`, `POST /meetings/:id/qa` (không tính `GET`/`DELETE`, thuộc nhóm "Còn lại") | 30 lần / giờ / người dùng |
| `/search` | 60 lần / phút / người dùng |
| WebSocket `transcript_segment` | 120 sự kiện / phút / cuộc họp |
| Còn lại | 300 lần / phút / người dùng |
