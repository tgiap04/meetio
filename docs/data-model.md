# GraphMeet — Mô hình dữ liệu

**Cơ sở dữ liệu:** PostgreSQL 15+ với extension `pgvector` và `unaccent`  
**Cập nhật:** 2026-09-17  
**Liên quan:** [User Stories](../user_stories.md) · [Kiến trúc](system-architecture.md) · [API](api-spec.md)

---

## 0. Khác biệt so với bản đặc tả cũ

| Thay đổi | Lý do |
|----------|-------|
| Thêm bảng `users`, thêm `user_id` vào mọi bảng gốc | Bản cũ không có chủ sở hữu → ai cũng đọc/xóa được cuộc họp của người khác |
| Bỏ cột `meetings.full_transcript`, thay bằng bảng `transcript_segments` | Bản cũ vừa lưu cả khối văn bản vừa lưu chunk (trùng dữ liệu), lại mất mốc thời gian và người nói |
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
| `password_hash` | TEXT | argon2id |
| `display_name` | TEXT | |
| `retention_days` | INT | NULL = giữ vĩnh viễn ([US-06](../user_stories.md#us-06--xem-và-đặt-chính-sách-lưu-trữ)) |
| `recording_consent_at` | TIMESTAMPTZ | Mốc xác nhận đã thông báo cho người tham dự ([US-04](../user_stories.md#us-04--thông-báo-và-ghi-nhận-sự-đồng-ý-ghi-âm)) |
| `monthly_token_budget` | BIGINT | [NFR-07](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr) |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMPTZ | `deleted_at` phục vụ xóa mềm 30 ngày ([US-05](../user_stories.md#us-05--xóa-tài-khoản-và-toàn-bộ-dữ-liệu)) |

### `refresh_tokens`
`id` UUID PK · `user_id` FK · `token_hash` TEXT · `expires_at` · `revoked_at` · `device_label` TEXT

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
| `summary` | TEXT | Do AI sinh |
| `summary_citations` | JSONB | Mảng `chunk_id` cho từng ý trong tóm tắt |
| `started_at` / `ended_at` | TIMESTAMPTZ | |
| `duration_sec` | INT | Không tính thời gian tạm dừng |
| `failure_reason` | TEXT | Chỉ có khi `status = failed` |
| `last_activity_at` | TIMESTAMPTZ | Dùng cho cơ chế tự đóng cuộc họp bỏ quên sau 24h |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMPTZ | |

```sql
CREATE INDEX idx_meetings_user_created ON meetings (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_meetings_status ON meetings (status)
  WHERE status IN ('recording','queued','processing');
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
| `speaker_label` | TEXT | NULL = "Không rõ" ([US-13](../user_stories.md#us-13--gán-nhãn-người-nói)) |
| `started_at_ms` / `ended_at_ms` | INT | Tính từ mốc bắt đầu cuộc họp |
| `is_edited` | BOOLEAN | Đánh dấu người dùng đã sửa tay |
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
| `token_count` | INT | |
| `embedding` | vector(768) | Gemini text-embedding-004 |
| `created_at` | TIMESTAMPTZ | |

```sql
CREATE INDEX idx_chunks_embedding ON meeting_chunks
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_user ON meeting_chunks (user_id);
```

Cột `user_id` được nhân bản ở đây là cố ý: truy vấn tương đồng vector cần lọc quyền **ngay trong**
câu lệnh tìm kiếm. Bắt nó join ngược về `meetings` để lọc sẽ phá hỏng hiệu quả của index HNSW.

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
| `aliases` | TEXT[] | Các tên đã được gộp vào ([US-40](../user_stories.md#us-40--gộp-các-thực-thể-bị-trùng)) |
| `embedding` | vector(768) | Nhúng từ tên + mô tả |
| `is_user_edited` | BOOLEAN | True thì pipeline không được ghi đè ([US-41](../user_stories.md#us-41--sửa-thực-thể-sai)) |
| `merged_into_id` | UUID | Trỏ tới thực thể chuẩn nếu bản ghi này đã bị gộp |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

```sql
CREATE INDEX idx_entities_embedding ON entities
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_entities_user_norm ON entities (user_id, normalized_name);
CREATE INDEX idx_entities_aliases ON entities USING gin (aliases);
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
| `created_at` / `updated_at` | TIMESTAMPTZ | |

```sql
CREATE INDEX idx_actions_user_status ON action_items (user_id, status, due_date);
```

Index này phục vụ trực tiếp màn hình tổng hợp việc cần làm ở
[US-34](../user_stories.md#us-34--xem-việc-cần-làm-của-mình-xuyên-các-cuộc-họp) — thứ mà cột JSONB
trong bản đặc tả cũ không thể làm được.

### `qa_messages`
`id` UUID PK · `user_id` FK · `meeting_id` FK NULL (NULL = hỏi xuyên cuộc họp) ·
`role` enum(`user`,`assistant`) · `content` TEXT · `citations` JSONB (mảng `{chunk_id, meeting_id}`) ·
`confidence` REAL · `tokens_used` INT · `created_at`

```sql
CREATE INDEX idx_qa_user_meeting ON qa_messages (user_id, meeting_id, created_at);
```

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
| Xóa tài khoản | Đặt `deleted_at`, chặn đăng nhập ngay; xóa vật lý sau 30 ngày qua tác vụ định kỳ |
| Hết hạn lưu trữ | Tác vụ hằng ngày xóa cuộc họp quá `retention_days`, có thông báo trước 7 ngày |
