# Meetio — Mô hình dữ liệu

**Cơ sở dữ liệu:** PostgreSQL 15+ với extension `pgvector` và `unaccent`  
**Cập nhật:** 2026-09-26  
**Liên quan:** [User Stories](../user_stories.md) · [Kiến trúc](system-architecture.md) · [API](api-spec.md)

---

## 0. Khác biệt so với bản đặc tả cũ

| Thay đổi | Lý do |
|----------|-------|
| Thêm bảng `users`, thêm `user_id` vào mọi bảng gốc | Bản cũ không có chủ sở hữu → ai cũng đọc/xóa được cuộc họp của người khác |
| Bỏ cột `meetings.full_transcript`, thay bằng bảng `transcript_segments` | Bản cũ vừa lưu cả khối văn bản vừa lưu chunk (trùng dữ liệu), lại mất mốc thời gian |
| **Bỏ cột `transcript_segments.speaker_label`** (2026-09-21) | Bối cảnh dùng chính là điện thoại thu tiếng từ loa laptop — âm thanh vào là một luồng trộn lẫn, không tách được người nói. Xem [US-13](../user_stories.md#us-13--gán-nhãn-người-nói--đã-bỏ-2026-09-21) |
| Thêm `meetings.audio_source` và `meetings.recording_quality` | Màn cài đặt ghi âm trong thiết kế có hai mục này ([US-42](../user_stories.md#us-42--chọn-nguồn-âm-thanh), [US-43](../user_stories.md#us-43--chọn-chế-độ-ghi-âm)) nhưng schema cũ không có chỗ lưu |
| Đồ thị chuyển từ phạm vi cuộc họp sang phạm vi người dùng (`entities` + `entity_mentions`) | Bản cũ gắn `meeting_id` vào node/edge → cùng một dự án thành nhiều node rời rạc, mất khả năng liên kết chéo |
| Thêm `meetings.status` và bảng `processing_jobs` | Bản cũ nói "cập nhật trạng thái Processing Done" nhưng không có chỗ nào lưu trạng thái |
| `action_items` tách thành bảng riêng thay cho cột JSONB | Bản cũ không định nghĩa cấu trúc → không truy vấn được "việc chưa xong của tôi" |
| Thêm bản dịch vào `transcript_segments` | Bản cũ dịch thời gian thực nhưng không lưu → họp xong bản dịch biến mất |
| Khai báo index rõ ràng, nhất là index vector | Bản cũ không nhắc tới; thiếu index HNSW thì mọi truy vấn tương đồng đều quét toàn bảng |

---

## 1. Tài khoản

### `users`
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | UUID | PK |
| `email` | CITEXT | UNIQUE |
| `password_hash` | TEXT | argon2id. NULL khi tài khoản chỉ đăng nhập Google |
| `google_sub` | TEXT | Claim `sub` của Google — khóa nối, không phải email (email có thể đổi). NULL khi chưa liên kết Google. `UNIQUE` |
| `display_name` | TEXT | |
| `retention_days` | INT | NULL = giữ vĩnh viễn ([US-06](../user_stories.md#us-06--xem-và-đặt-chính-sách-lưu-trữ)) |
| `recording_consent_at` | TIMESTAMPTZ | Mốc xác nhận đã thông báo cho người tham dự ([US-04](../user_stories.md#us-04--thông-báo-và-ghi-nhận-sự-đồng-ý-ghi-âm)) |
| `monthly_token_budget` | BIGINT | [NFR-07](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr) |
| `notification_settings` | JSONB | Mặc định `{}`. Bản đặc tả cũ cho `PATCH /users/me` sửa "cài đặt thông báo" nhưng không có cột nào lưu — client ghi được mà không đọc lại được |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMPTZ | `deleted_at` phục vụ xóa mềm 30 ngày ([US-05](../user_stories.md#us-05--xóa-tài-khoản-và-toàn-bộ-dữ-liệu)) |

```sql
ALTER TABLE users ADD CONSTRAINT chk_users_has_credential
  CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
```

Không có cột `provider` riêng — cố ý. Tài khoản đăng nhập được bằng mật khẩu hay bằng Google (hay cả
hai) suy trực tiếp từ hai cột trên; một cột thứ ba chỉ thêm một nguồn sự thật có thể lệch khỏi hai
cột kia. `CHECK` ở trên là ràng buộc bảo đảm mọi hàng luôn còn ít nhất một lối vào.

### `refresh_tokens`
`id` UUID PK · `user_id` FK · `token_hash` TEXT · `expires_at` · `revoked_at` · `device_label` TEXT

### `push_tokens`
Một hàng cho mỗi thiết bị đã đăng ký nhận push "cuộc họp đã xử lý xong"
([US-30](../user_stories.md#us-30--nhận-thông-báo-khi-phân-tích-xong)).

`id` UUID PK · `user_id` FK → `users`, `ON DELETE CASCADE` · `token` TEXT `UNIQUE` (Expo push token) ·
`platform` TEXT (`CHECK ... IN ('ios', 'android')`) · `created_at` · `last_seen_at` TIMESTAMPTZ

```sql
CREATE INDEX idx_push_tokens_user ON push_tokens (user_id);
```

`token` là khóa duy nhất, không phải `(user_id, token)`: một token vật lý chỉ thuộc về đúng một tài
khoản tại một thời điểm. Đăng ký lại trên tài khoản khác (`ON CONFLICT (token) DO UPDATE`) chuyển
hẳn quyền sở hữu — tài khoản trước đó ngừng nhận push trên máy đó.

---

## 2. Cuộc họp và transcript

### `meetings`
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users`, **NOT NULL** |
| `title` | TEXT | Mặc định sinh theo thời gian |
| `status` | meeting_status | enum: `recording`/`paused`/`ended`/`queued`/`processing`/`ready`/`failed` |
| `source_language` | TEXT | Mã BCP-47, ví dụ `vi-VN` |
| `translate_to` | TEXT | NULL = tắt dịch |
| `audio_source` | audio_source | enum: `device_mic` / `external_bluetooth` ([US-42](../user_stories.md#us-42--chọn-nguồn-âm-thanh)) |
| `recording_quality` | recording_quality | enum: `standard` / `high` ([US-43](../user_stories.md#us-43--chọn-chế-độ-ghi-âm)) |
| `summary` | TEXT | Do AI sinh |
| `summary_citations` | JSONB | Mảng trích dẫn, mỗi phần tử `{kind: "point"|"decision", text, chunk_ids: string[], segment_seq}` — `chunk_ids` là id thật của các chunk được trích, `segment_seq` là seq transcript của chunk được trích đầu tiên (phase 14) |
| `summary_insufficient` | BOOLEAN | True khi cuộc họp quá ngắn hoặc quá ít nội dung để tóm tắt — bước `summarize` không gọi model, `summary` là câu cố định giải thích lý do (phase 14) |
| `started_at` / `ended_at` | TIMESTAMPTZ | |
| `duration_sec` | INT | Không tính thời gian tạm dừng |
| `failure_reason` | TEXT | Chỉ có khi `status = failed` |
| `last_activity_at` | TIMESTAMPTZ | Dùng cho cơ chế tự đóng cuộc họp bỏ quên sau 24h |
| `paused_at` | TIMESTAMPTZ | NULL trừ khi đang tạm dừng; đặt lúc `pause`, xóa lúc `resume` |
| `paused_duration_ms` | BIGINT | Tổng thời gian đã tạm dừng, cộng dồn mỗi lần `resume`; `duration_sec` trừ đi giá trị này |
| `pipeline_run` | INT | Tăng mỗi lần cuộc họp được (re)queue; job id hàng đợi là `<meeting>-r<run>[-<step>]` nên một lần chạy lại là job mới, không bị BullMQ coi là trùng |
| `pipeline_scope` | TEXT | `full` hoặc `changed` cho lượt chạy hiện tại; enum kiểm bằng `CHECK`, không dùng Postgres enum type |
| `pipeline_started_at` | TIMESTAMPTZ | Lúc lượt chạy hiện tại bắt đầu |
| `pipeline_changed_since` | TIMESTAMPTZ | Lúc lượt chạy **trước** bắt đầu; đoạn nào sửa sau mốc này mới bị lượt `changed` xử lý lại |
| `ready_notified_at` | TIMESTAMPTZ | Claim một lần bằng UPDATE có điều kiện, đảm bảo push "đã xử lý xong" chỉ gửi đúng một lần mỗi cuộc họp ([US-30](../user_stories.md#us-30--nhận-thông-báo-khi-phân-tích-xong)) |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMPTZ | |

```sql
CREATE INDEX idx_meetings_user_created ON meetings (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_meetings_status ON meetings (status)
  WHERE status IN ('recording','paused','queued','processing');
CREATE INDEX idx_meetings_title_trgm ON meetings
  USING gin (unaccent(lower(title)) gin_trgm_ops);
```

### `transcript_segments`
Đơn vị nhỏ nhất của transcript, và là **nguồn sự thật duy nhất** cho nội dung cuộc họp.

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | UUID | PK |
| `meeting_id` | UUID | FK, ON DELETE CASCADE |
| `seq` | INT | Do client cấp, tăng đơn điệu |
| `text` | TEXT | Văn bản đã chốt |
| `translated_text` | TEXT | NULL nếu tắt dịch ([US-19](../user_stories.md#us-19--xem-lại-bản-dịch-sau-cuộc-họp)) |
| `translated_to` | TEXT | Mã ngôn ngữ của bản dịch |
| `started_at_ms` / `ended_at_ms` | INT | Tính từ mốc bắt đầu cuộc họp |
| `is_edited` | BOOLEAN | Đánh dấu người dùng đã sửa tay |
| `edited_at` | TIMESTAMPTZ | NULL nếu chưa từng sửa. `is_edited` nói *có sửa hay không*, cột này nói *từ lượt chạy pipeline nào* — dùng để lượt `reindex scope=changed` biết đoạn nào cần xử lý lại ([US-24](../user_stories.md#us-24--sửa-nội-dung-nhận-diện-sai)) |
| `gap_before_ms` | INT | Độ dài khoảng gián đoạn trước đoạn này (khi engine khởi động lại) |
| `created_at` | TIMESTAMPTZ | |

```sql
CREATE UNIQUE INDEX uq_segment_meeting_seq ON transcript_segments (meeting_id, seq);
CREATE INDEX idx_segment_meeting_time ON transcript_segments (meeting_id, started_at_ms);
```

`UNIQUE (meeting_id, seq)` chính là thứ làm cho việc gửi lại trở nên an toàn: client gửi bao nhiêu
lần cũng chỉ sinh một bản ghi ([US-14](../user_stories.md#us-14--không-mất-dữ-liệu-khi-mạng-chập-chờn)).

---

## 3. Tầng truy hồi

### `meeting_chunks`
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | UUID | PK |
| `meeting_id` | UUID | FK, CASCADE |
| `user_id` | UUID | Nhân bản có chủ đích, để lọc quyền mà không phải join |
| `content` | TEXT | Văn bản gộp từ các segment |
| `segment_start_seq` / `segment_end_seq` | INT | Truy vết ngược về transcript cho trích dẫn |
| `token_count` | INT, NULL | Số token thật từ Gemini `countTokens`, ghi cùng lúc với `embedding`. NULL = đã cắt đoạn, chưa nhúng |
| `embedding` | vector(768), NULL | `gemini-embedding-001`, đã chuẩn hoá L2. NULL = đã cắt đoạn, chưa nhúng |
| `content_hash` | TEXT | sha256 của `"start:end:content"` — giữ nguyên id/embedding/trích dẫn của chunk không đổi khi chạy lại |
| `extraction` | JSONB, NULL | `{entities[], relations[]}` bước `extract` trả về cho chunk này (phase 13). NULL: chưa xử lý, **hoặc** đã xử lý nhưng model trả sai schema 3 lần liền nên chunk bị bỏ qua — phân biệt hai trường hợp bằng `extracted_at` |
| `extracted_at` | TIMESTAMPTZ, NULL | Lúc bước `extract` xử lý xong chunk này (dù có `extraction` hay không). NULL = còn chờ xử lý |
| `resolved_at` | TIMESTAMPTZ, NULL | Lúc bước `resolve` đã gắn `extraction` của chunk này vào đồ thị (tạo/khớp entity, ghi mention/relation). NULL = còn chờ, hoặc chunk chưa `extracted_at` |
| `created_at` | TIMESTAMPTZ | |

```sql
CREATE INDEX idx_chunks_embedding ON meeting_chunks
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_user ON meeting_chunks (user_id);
CREATE UNIQUE INDEX uq_chunks_meeting_hash ON meeting_chunks (meeting_id, content_hash);
```

`extracted_at IS NULL` chọn nhóm chunk kế tiếp cho bước `extract` (4 chunk/lần gọi Gemini, xem
[system-architecture.md §3](system-architecture.md#3-luồng-2--pipeline-phân-tích)); `extracted_at IS
NOT NULL AND resolved_at IS NULL` chọn chunk kế tiếp cho bước `resolve` (từng chunk một, có khóa
advisory theo người dùng). Một lượt `changed` chỉ cắt lại đúng chunk bị đoạn sửa chạm tới
(`content_hash` đổi → hàng mới → cả ba cột này lại NULL), nên retry chỉ trả tiền cho phần thật sự
đổi.

Cột `user_id` được nhân bản ở đây là cố ý: truy vấn tương đồng vector cần lọc quyền **ngay trong**
câu lệnh tìm kiếm. Bắt nó join ngược về `meetings` để lọc sẽ phá hỏng hiệu quả của index HNSW.

`embedding` và `token_count` cùng nullable từ Phase 12, vì cắt đoạn (`chunk`) và nhúng vector
(`embed`) nay là hai bước pipeline tách biệt, mỗi bước một job, thử lại riêng — bước `chunk` phải
ghi được một hàng mà bước `embed` chưa kịp điền. Chỉ mục HNSW bỏ qua hàng `embedding IS NULL`, và
`GET /search` chỉ đọc hàng đã có embedding (`c.embedding IS NOT NULL`, xem
[system-architecture.md §3](system-architecture.md#3-luồng-2--pipeline-phân-tích) và
[§4](system-architecture.md#4-luồng-3--truy-hồi-và-hỏi-đáp-graphrag)). Ràng buộc unique
`(meeting_id, content_hash)` là điều kiện để chạy lại sau khi sửa transcript giữ nguyên chunk chưa
đổi — id, embedding và các mention/relation trích dẫn nó — thay vì cắt lại từ đầu.

---

## 4. Đồ thị tri thức (phạm vi người dùng)

### `entities`
Thực thể chuẩn, dùng chung cho mọi cuộc họp của một người dùng.

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | UUID | PK |
| `user_id` | UUID | FK — **phạm vi là người dùng, không phải cuộc họp** |
| `canonical_name` | TEXT | Tên hiển thị |
| `normalized_name` | TEXT | Bỏ dấu, thường hóa, bỏ kính ngữ — dùng để khớp chính xác |
| `type` | entity_type | enum: `person`/`project`/`organization`/`topic`/`product`/`other` |
| `description` | TEXT | Do AI sinh, gộp dần qua các lần nhắc |
| `aliases` | TEXT[] | Các tên đã được gộp vào, giữ nguyên dạng gốc để hiển thị ([US-40](../user_stories.md#us-40--gộp-các-thực-thể-bị-trùng)) |
| `normalized_aliases` | TEXT[] | Bản chuẩn hóa song song của `aliases` (phase 13) — tier khớp chính xác so khớp `normalized_name` **hoặc** bất kỳ phần tử nào ở đây, nên một thực thể đổi tên hay được gộp vẫn được nhận ra ở lần nhắc sau bằng tên cũ |
| `embedding` | vector(768) | Nhúng từ tên + mô tả |
| `is_user_edited` | BOOLEAN | True thì pipeline không được ghi đè ([US-41](../user_stories.md#us-41--sửa-thực-thể-sai)) |
| `merged_into_id` | UUID | Trỏ tới thực thể chuẩn nếu bản ghi này đã bị gộp |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

```sql
CREATE INDEX idx_entities_embedding ON entities
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_entities_user_norm ON entities (user_id, normalized_name);
CREATE INDEX idx_entities_aliases ON entities USING gin (aliases);
CREATE INDEX idx_entities_normalized_aliases ON entities USING gin (normalized_aliases);
```

### `entity_mentions`
Cầu nối giữa thực thể toàn cục và từng lần xuất hiện cụ thể. Đây chính là thứ cho phép hỏi đáp
xuyên cuộc họp và dựng dòng thời gian của một thực thể
([US-39](../user_stories.md#us-39--theo-dõi-một-thực-thể-qua-thời-gian)).

`id` UUID PK · `entity_id` FK CASCADE · `meeting_id` FK CASCADE · `chunk_id` FK CASCADE ·
`surface_form` TEXT (nguyên văn cách gọi trong cuộc họp) · `created_at`

```sql
CREATE INDEX idx_mentions_entity ON entity_mentions (entity_id, meeting_id);
CREATE INDEX idx_mentions_meeting ON entity_mentions (meeting_id);
```

### `relations`
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | UUID | PK |
| `user_id` | UUID | FK |
| `source_entity_id` / `target_entity_id` | UUID | FK → `entities` |
| `relationship` | TEXT | Ví dụ "phụ trách", "yêu cầu sử dụng" |
| `meeting_id` | UUID | Cuộc họp quan sát được quan hệ này |
| `chunk_id` | UUID | Đoạn sinh ra quan hệ — dùng làm trích dẫn |
| `confidence` | REAL | 0–1, do LLM trả về |
| `created_at` | TIMESTAMPTZ | |

```sql
CREATE INDEX idx_relations_source ON relations (source_entity_id);
CREATE INDEX idx_relations_target ON relations (target_entity_id);
CREATE INDEX idx_relations_user ON relations (user_id);
```

Cùng một quan hệ quan sát ở nhiều cuộc họp sẽ tạo nhiều dòng — cố ý như vậy. Số lần lặp lại chính
là tín hiệu về độ tin cậy, và mỗi dòng giữ được nguồn trích dẫn riêng.

### `entity_merge_rejections`
Ghi lại các cặp người dùng đã bác bỏ, để hệ thống không đề xuất lại mãi.

`user_id` · `entity_a_id` · `entity_b_id` · `rejected_at` — PK gộp `(user_id, entity_a_id, entity_b_id)`

### `entity_merge_suggestions`
Cặp thực thể tier khớp-theo-vector nghi là trùng, chờ người dùng duyệt ở
`GET /entities/merge-suggestions` (phase 13, [OQ-03](../user_stories.md#5-câu-hỏi-còn-mở)).

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users`, CASCADE |
| `entity_a_id` / `entity_b_id` | UUID | FK → `entities`, CASCADE. Lưu theo thứ tự `a < b` (`CHECK`) nên một cặp chỉ tồn tại tối đa một dòng |
| `score` | REAL | Cosine similarity `[0, 1]` giữa embedding tên+mô tả hai bên |
| `created_at` | TIMESTAMPTZ | |

```sql
CREATE INDEX idx_merge_suggestions_entity_b ON entity_merge_suggestions (entity_b_id);
```

`UNIQUE (user_id, entity_a_id, entity_b_id)` cộng `ON CONFLICT DO NOTHING` khi ghi: cùng một cặp
gặp lại ở cuộc họp khác không tạo thêm dòng. Duyệt (`POST /entities/merge`) hoặc bác bỏ
(`POST .../reject`) đều xóa dòng tương ứng — reject còn ghi thêm vào `entity_merge_rejections` để
không đề xuất lại; một type edit khiến hai bên khác `type` làm đề xuất hết hiệu lực (lọc ở câu
truy vấn đọc, không xóa dòng).

### `entity_merges`
Ghi lại chính xác những gì một lần gộp đã di chuyển, để tách lại được trong 30 ngày
([US-40](../user_stories.md#us-40--gộp-các-thực-thể-bị-trùng)).

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | UUID | PK — chính là `:id` của `POST /entities/merge/:id/undo` |
| `user_id` | UUID | FK → `users`, CASCADE |
| `keep_id` | UUID | FK → `entities`, CASCADE — thực thể được giữ lại |
| `merged_id` | UUID | FK → `entities`, CASCADE — thực thể đã gộp vào `keep_id` |
| `snapshot` | JSONB | Tên/alias đã thêm vào `keep`, id các mention/relation đã chuyển chủ, các quan hệ giữa hai bên bị xóa vì thành self-loop, và các con đã gộp tiếp vào `merged_id` — đủ để undo khôi phục đúng những gì, không hơn |
| `created_at` | TIMESTAMPTZ | |
| `undone_at` | TIMESTAMPTZ, NULL | Đặt khi đã tách lại — undo chỉ chạy được một lần |

```sql
CREATE INDEX idx_entity_merges_keep ON entity_merges (keep_id, created_at);
CREATE INDEX idx_entity_merges_merged ON entity_merges (merged_id);
```

Undo bị từ chối (**409** `INVALID_STATE_TRANSITION`) khi `undone_at` đã có, khi `created_at` quá 30
ngày, hoặc khi `merged_id` đã bị gộp tiếp vào một thực thể khác từ đó
([api-spec.md §7](api-spec.md#7-đồ-thị-tri-thức)).

---

## 5. Kết quả đầu ra

### `action_items`
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | UUID | PK |
| `meeting_id` | UUID | FK CASCADE |
| `user_id` | UUID | FK |
| `content` | TEXT | Nội dung việc |
| `assignee_entity_id` | UUID | FK → `entities`, NULL khi không xác định được |
| `due_date` | DATE | NULL nếu cuộc họp không nhắc hạn |
| `status` | action_status | enum: `open`/`done` |
| `source_chunk_id` | UUID | Trích dẫn nguồn |
| `is_manual` | BOOLEAN | True nếu người dùng tự thêm ([US-32](../user_stories.md#us-32--xem-danh-sách-việc-cần-làm)) |
| `is_user_edited` | BOOLEAN | True sau bất kỳ sửa nào của người dùng (nội dung, người phụ trách, hạn, trạng thái) — một lượt `summarize` chạy lại chỉ thay các việc AI tạo mà cột này vẫn false (phase 14) |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

```sql
CREATE INDEX idx_actions_user_status ON action_items (user_id, status, due_date);
```

Index này phục vụ trực tiếp màn hình tổng hợp việc cần làm ở
[US-34](../user_stories.md#us-34--xem-việc-cần-làm-của-mình-xuyên-các-cuộc-họp) — thứ mà cột JSONB
trong bản đặc tả cũ không thể làm được.

### `action_item_dismissals`
Việc do AI tạo mà người dùng đã xóa, theo nội dung đã chuẩn hóa — để một lượt `summarize` chạy lại
sau đó (sửa transcript, hoặc `reindex`) không tạo lại đúng việc đó dù model lại rút ra y hệt nội
dung (phase 14).

`meeting_id` UUID FK → `meetings`, CASCADE · `content_key` TEXT (chuẩn hóa bỏ dấu/hoa-thường/dấu câu,
cùng hàm chuẩn hóa tên thực thể) · `dismissed_at` TIMESTAMPTZ — PK gộp `(meeting_id, content_key)`.

Không có `is_manual` — chỉ việc AI tạo mới ghi dòng ở đây; xóa một việc thủ công không cần nhớ gì
thêm vì AI không bao giờ tạo lại nó.

### `qa_messages`
`id` UUID PK · `user_id` FK · `meeting_id` FK NULL (NULL = hỏi xuyên cuộc họp, một luồng toàn cục
dùng chung cho mọi câu hỏi không gắn cuộc họp) · `role` enum(`user`,`assistant`) · `content` TEXT ·
`citations` JSONB NULL · `confidence` REAL NULL · `not_found` BOOLEAN NOT NULL DEFAULT false ·
`filters` JSONB NULL · `tokens_used` INT NULL · `created_at`

```sql
CREATE INDEX idx_qa_user_meeting ON qa_messages (user_id, meeting_id, created_at);
```

`not_found`: đặt ở tin nhắn `assistant` khi không có gì trong các cuộc họp trả lời được câu hỏi —
model không được gọi để đoán ([US-35](../user_stories.md#us-35--hỏi-đáp-trong-một-cuộc-họp)).

`filters`: đặt ở tin nhắn `user` của một câu hỏi `/qa` (xuyên cuộc họp) có kèm ít nhất một trong
`from`/`to`/`entity_id`; hình dạng `{from, to, entity_id, entity_name}`, mọi trường có thể `null`.
`null` ở tin nhắn `user` không kèm bộ lọc nào và luôn `null` ở tin nhắn `assistant`.

`citations` (tin nhắn `assistant`, `null`/rỗng khi `not_found`): mảng
`{chunk_id, meeting_id, meeting_title, meeting_date, segment_seq, excerpt}` — `meeting_title` và
`meeting_date` được chốt lại **tại thời điểm trả lời** (không tra cứu `meetings` mỗi lần đọc), nên
vẫn hiển thị đúng tên/ngày cuộc họp cũ dù cuộc họp đó đổi tên sau này. Cờ `available` mà API trả về
**không** lưu trong JSONB này — nó được tính lại ở mỗi lần đọc, bằng cách đối chiếu `chunk_id` với
`meeting_chunks` còn tồn tại (và cuộc họp chưa xóa): `true` nếu đoạn còn đó, `false` nếu transcript
đã được sửa và cắt lại từ đó nên đoạn trích đã mất.

---

## 6. Vận hành

### `processing_jobs`
`id` UUID PK · `meeting_id` FK CASCADE · `step` enum(`chunk`,`embed`,`extract`,`resolve`,`summarize`) ·
`status` enum(`pending`,`running`,`succeeded`,`failed`) · `attempts` INT · `error_message` TEXT ·
`started_at` · `finished_at`

```sql
CREATE UNIQUE INDEX uq_job_meeting_step ON processing_jobs (meeting_id, step);
```

Ràng buộc duy nhất trên `(meeting_id, step)` là thứ khiến việc chạy lại trở nên idempotent: bước
đã `succeeded` thì lần chạy lại bỏ qua ([US-29](../user_stories.md#us-29--thử-lại-khi-xử-lý-thất-bại)).

### `usage_records`
`id` UUID PK · `user_id` FK · `meeting_id` FK NULL · `operation` TEXT · `model` TEXT ·
`input_tokens` INT · `output_tokens` INT · `created_at` — phục vụ theo dõi hạn mức ở [NFR-07](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr).

---

## 7. Quy tắc xóa

| Hành động | Hệ quả |
|-----------|--------|
| Xóa cuộc họp | CASCADE: segments, chunks, mentions, relations, action items, qa_messages, jobs |
| Sau khi xóa cuộc họp | Thực thể không còn `entity_mention` nào → xóa nốt. Còn mention ở cuộc họp khác → giữ nguyên ([US-26](../user_stories.md#us-26--xóa-cuộc-họp)) |
| Xóa tài khoản | Đặt `deleted_at`, chặn đăng nhập ngay; xóa vật lý sau 30 ngày qua tác vụ định kỳ. `push_tokens` CASCADE theo `user_id` — thiết bị ngừng nhận push ngay khi tài khoản bị xóa vật lý |
| Hết hạn lưu trữ | Tác vụ hằng ngày xóa cuộc họp quá `retention_days`, có thông báo trước 7 ngày |
