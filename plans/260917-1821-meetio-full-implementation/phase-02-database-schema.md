# Phase 02 · Schema cơ sở dữ liệu

**Liên kết:** [plan.md](plan.md) · [Mô hình dữ liệu](../../docs/data-model.md) ·
[Kiểm chứng stack](../reports/researcher-2026-09-17-stack-verification.md)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 01

Hiện thực hóa toàn bộ 13 bảng, enum, ràng buộc và index. Không có logic nghiệp vụ ở phase này.

## Nhận định then chốt
- `UNIQUE (meeting_id, seq)` trên `transcript_segments` chính là thứ làm cho việc gửi lại an toàn.
  Thiếu nó thì cơ chế chống mất dữ liệu ở [US-14](../../user_stories.md#us-14--không-mất-dữ-liệu-khi-mạng-chập-chờn) vô nghĩa.
- Index HNSW cho vector phải có ngay từ migration đầu. Thêm sau trên bảng lớn là một lần khóa bảng dài.
- `user_id` được nhân bản có chủ đích ở `meeting_chunks`: truy vấn tương đồng phải lọc quyền ngay
  trong câu lệnh, ép join ngược sẽ phá hiệu quả index.
- Đồ thị thuộc phạm vi **người dùng**, không phải cuộc họp. Đây là khác biệt nền tảng so với bản
  đặc tả gốc và nó định hình toàn bộ Phase 13 và 15.
- **TypeORM 1.1.1 khai báo được phần lớn schema này bằng decorator** — kể cả `vector(768)`, CITEXT,
  PG enum và partial index. Chỉ index HNSW, index GIN theo biểu thức và `CREATE EXTENSION` là phải
  viết SQL thô. Chính ba thứ đó khiến `synchronize: false` là bắt buộc: synchronize không biết chúng
  tồn tại nên sẽ **xóa** chúng đi.

## Yêu cầu
**Chức năng:** migration tạo đủ bảng, enum, khóa ngoại, index; có seed dữ liệu mẫu cho phát triển.
**Phi chức năng:** migration chạy tiến và lùi được; đặt tên thống nhất; mọi khóa ngoại có index.

## Kiến trúc

TypeORM làm ORM, **`synchronize: false` vĩnh viễn**. Mọi thay đổi schema đi qua migration được
kiểm soát. Migration là TypeScript thuần nên chỗ nào cần SQL thô thì viết thẳng vào — đây chính là
lý do TypeORM phù hợp schema này hơn Prisma.

Dùng decorator ở đâu có thể, SQL thô ở đâu buộc phải — xem bảng dưới.

### Giới hạn TypeORM — cái gì có DSL, cái gì phải viết SQL

**Phiên bản đã cài và kiểm chứng: `typeorm@1.1.1`** (npm `latest`; `legacy` là `0.3.31`).
Bảng dưới đây **đã đối chiếu trực tiếp với file `.d.ts` trong `node_modules/typeorm`**, không phải
phỏng đoán:

| Thứ cần | TypeORM 1.1.1 | Cách làm |
|---------|---------------|----------|
| Cột `vector(768)` | ✅ native | `@Column('vector', { length: 768 })` — `'vector'` nằm trong `WithLengthColumnType` (kèm cả `halfvec`, `half_vector`, `real_vector`) |
| Cột CITEXT | ✅ native | `@Column('citext')` — `'citext'` nằm trong `SimpleColumnType` |
| PG enum (5 cái) | ✅ native | `@Column({ type: 'enum', enum: [...], enumName: '...' })` |
| Partial index (`WHERE deleted_at IS NULL`) | ✅ native | `@Index(..., { where: 'deleted_at IS NULL' })` |
| Index GIN trên cột thường (`aliases`) | ✅ native | `@Index(..., { type: 'gin' })` |
| Xếp hạng cosine `<=>` | ⚠️ lai | QueryBuilder + toán tử dạng chuỗi thô trong `.orderBy()`, tham số qua `pgvector.toSql()`. **`find()` không làm được** |
| **Index HNSW** | ❌ | `queryRunner.query()`. `TableIndexTypes` chỉ có `btree\|hash\|gist\|spgist\|gin\|brin` — **không có `hnsw`** |
| **GIN trigram trên biểu thức** `unaccent(lower(title))` | ❌ | `queryRunner.query()`. Không hỗ trợ index theo biểu thức, cũng không hỗ trợ opclass |
| `CREATE EXTENSION` | ❌ | `queryRunner.query()` |

> **Đính chính so với bản trước của tài liệu này.** Bản trước ghi CITEXT / PG enum / partial index
> là "không có DSL" và phải viết SQL tay — **sai**, do bám theo mốc phiên bản 0.3.x đã lỗi thời.
> TypeORM 1.1.1 làm được cả bốn thứ đó bằng decorator. **Chỉ còn ba thứ thật sự cần SQL thô:**
> index HNSW, index GIN theo biểu thức, và `CREATE EXTENSION`.
> Viết tay những cái không cần là tự chuốc việc và tự tạo chỗ sai.

> **TypeORM 1.1.1 là gói lai (dual-format), không phải ESM-only.** `package.json` không có trường
> `"type"`, `main` trỏ `./index.js` (CJS), và `exports` có cả `node.import → ./index.mjs` lẫn
> `node.require → ./index.js`. Nên nó chạy được với `apps/api` (ESM) mà không cần thủ thuật gì.

> **API 1.x khác 0.3.x.** Trước khi viết entity, đọc lại tài liệu TypeORM cho đúng nhánh 1.x —
> đừng tra cứu theo thói quen 0.3.x. Bộ dependency cũng đã đổi.

Nhóm bảng: tài khoản (`users`, `refresh_tokens`) · cuộc họp (`meetings`, `transcript_segments`) ·
truy hồi (`meeting_chunks`) · đồ thị (`entities`, `entity_mentions`, `relations`,
`entity_merge_rejections`) · kết quả (`action_items`, `qa_messages`) · vận hành (`processing_jobs`,
`usage_records`).

**Entity không bao giờ lộ ra bề mặt API.** Entity là tầng lưu trữ; DTO ở `apps/api/**/dto/` là bề
mặt. Trả entity thẳng ra controller là rò rỉ cột nội bộ (`password_hash`, `token_hash`) ra ngoài.

## File liên quan
**Tạo:** `apps/api/src/database/entities/` (13 entity) ·
`apps/api/src/database/migrations/` (migration viết tay) ·
`apps/api/src/database/data-source.ts` (TypeORM DataSource, `synchronize: false`) ·
`apps/api/src/database/database.module.ts` ·
`apps/api/src/database/vector.repository.ts` (truy vấn vector cô lập) ·
`apps/api/src/database/seed.ts`

## Các bước thực hiện
1. Dependency đã cài và kiểm chứng ở lần di trú ESM: `typeorm@1.1.1`, `@nestjs/typeorm@12.0.1`,
   `pg@8.23.0`, `pgvector@0.3.0`. Không phải cài lại, không phải kiểm lại phiên bản.
2. `data-source.ts`: `synchronize: false`, `migrationsRun: false`, đăng ký kiểu `vector` của pgvector.
3. Migration đầu: `CREATE EXTENSION vector; CREATE EXTENSION unaccent; CREATE EXTENSION pg_trgm;`
4. Khai 5 enum bằng decorator (`type: 'enum'` + `enumName`): `meeting_status`, `entity_type`,
   `action_status`, `job_step`, `job_status`.
5. Viết 13 entity đúng theo [mô hình dữ liệu](../../docs/data-model.md). Cột snake_case. Cột
   embedding khai `@Column('vector', { length: 768 })`.
6. Migration bảng: khóa chính, khóa ngoại, quy tắc cascade đúng bảng đối chiếu ở
   [mục 7](../../docs/data-model.md#7-quy-tắc-xóa). Cột `email` khai `@Column('citext')`.
7. Index — chia đúng hai loại:
   - **Decorator:** partial index (`{ where: 'deleted_at IS NULL' }`), GIN trên `aliases`
     (`{ type: 'gin' }`), B-tree cho khóa ngoại và cột sắp xếp.
   - **SQL thô (`queryRunner.query()`):** index HNSW cho hai bảng có embedding, và GIN trigram trên
     biểu thức `unaccent(lower(title))`.
8. `vector.repository.ts`: cô lập **mọi** truy vấn `<=>` vào đúng file này. QueryBuilder +
   `pgvector.toSql()`. Không rải toán tử vector khắp code.
9. Viết seed: 1 người dùng, 3 cuộc họp với transcript thật, thực thể và quan hệ mẫu.
10. Viết test migration: chạy tiến → chạy lùi → chạy tiến lại, dữ liệu vẫn nguyên vẹn.

## Todo
- [x] ~~Ghim phiên bản TypeORM~~ — xong ở lần di trú ESM: `typeorm@1.1.1`, `'vector'` native
- [ ] `data-source.ts` với `synchronize: false`
- [ ] Migration extension (vector, unaccent, pg_trgm)
- [ ] 5 enum bằng decorator (`type: 'enum'` + `enumName`)
- [ ] 13 entity TypeORM, cột snake_case
- [ ] Migration bảng + khóa ngoại + cascade + `@Column('citext')`
- [ ] Index bằng decorator (partial, GIN trên `aliases`, B-tree)
- [ ] Index bằng SQL thô (HNSW ×2, GIN trigram trên biểu thức)
- [ ] `vector.repository.ts` cô lập truy vấn `<=>`
- [ ] Script seed
- [ ] Test migration tiến/lùi/tiến lại
- [ ] Đo thời gian truy vấn vector trên 10.000 chunk giả lập

## Chuẩn hoàn thành
- `yarn typeorm migration:run` chạy sạch trên cơ sở dữ liệu trống.
- `synchronize: false` ở mọi môi trường — kiểm bằng test đọc config.
- Tìm tương đồng vector trên 10.000 chunk trả về dưới 100ms **và `EXPLAIN` phải cho thấy
  `Index Scan using idx_chunks_embedding`**. Chỉ đo thời gian là chưa đủ — xem cảnh báo dưới.
- Xóa một cuộc họp dọn sạch mọi bảng con, thực thể chia sẻ với cuộc họp khác vẫn còn nguyên.
- Chèn hai segment trùng `(meeting_id, seq)` bị ràng buộc chặn lại.
- Grep toàn bộ `apps/api/src` cho `<=>` chỉ ra kết quả trong `vector.repository.ts`.

## ⚠️ Phát hiện đo được — planner KHÔNG tự chọn HNSW ở quy mô nhỏ

Đo thật trên 10.003 chunk (768 chiều), cùng một câu truy vấn, chỉ khác việc cho phép seq scan:

| Truy vấn | Kế hoạch thực thi | Thời gian |
|----------|-------------------|-----------|
| Có lọc `user_id`, planner tự chọn | `Seq Scan` + top-N heapsort | **20,7 ms** |
| Không lọc gì, planner tự chọn | `Seq Scan` | 19,8 ms |
| Có lọc `user_id`, `enable_seqscan = off` | **`Index Scan using idx_chunks_embedding`** | **0,245 ms** |

**Index HNSW hoạt động tốt và nhanh hơn ~80 lần. Nhưng planner không chọn nó.** Ở 10.000 dòng,
bảng chỉ khoảng 300 trang nên mô hình chi phí cho seq scan (290) rẻ hơn chi phí khởi động của HNSW
(640). Đây là đặc tính đã biết của pgvector, không phải lỗi cấu hình.

**Hệ quả nguy hiểm:** chuẩn "dưới 100ms" **đạt vì quét tuần tự đủ nhanh, chứ không phải vì index
chạy**. Index chưa từng được dùng trong phép đo đó. Quét tuần tự tăng tuyến tính theo số dòng —
100.000 chunk sẽ khoảng 200ms, 1 triệu chunk khoảng 2 giây, trong khi HNSW vẫn dưới 1ms.
Đây đúng kiểu cổng kiểm thử xanh cho tới lúc dữ liệu thật làm nó vỡ.

**Không được** đặt `enable_seqscan = off` ở production để ép — đó là bịt triệu chứng và làm hỏng
mọi truy vấn khác. Cách đúng:

1. **Chuẩn nghiệm thu phải khẳng định kế hoạch thực thi**, không chỉ thời gian: `EXPLAIN` bắt buộc
   hiện `Index Scan using idx_chunks_embedding`.
2. Đo lại ở quy mô thật (≥ 100.000 chunk) để tìm điểm giao chi phí, nơi planner tự chuyển sang HNSW.
3. Chỉnh `hnsw.ef_search` theo số đo, và cân nhắc hạ `random_page_cost` nếu chạy trên SSD.
4. Mang phát hiện này sang [Phase 12](phase-12-chunking-embedding-search.md) và
   [Phase 15](phase-15-graphrag-qa.md) — đó mới là nơi truy vấn vector chạy thật.

### Đính chính cho [mô hình dữ liệu §3](../../docs/data-model.md#3-tầng-truy-hồi)

Tài liệu đó viết nhân bản `user_id` vào `meeting_chunks` là để "lọc quyền ngay trong câu lệnh, ép
join ngược sẽ phá hỏng hiệu quả của index HNSW". **Nhân bản `user_id` vẫn đúng và vẫn nên giữ** —
nó bỏ được một phép join. Nhưng nó **không tự nó bảo đảm** HNSW được dùng: phép đo (A) cho thấy
ngay cả khi bỏ hẳn bộ lọc, planner vẫn chọn seq scan. Quyết định của planner phụ thuộc quy mô bảng
và mô hình chi phí, không phụ thuộc việc có join hay không.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Tra tài liệu TypeORM 0.3.x theo thói quen trong khi dự án chạy 1.1.1 | API 1.x khác hẳn. Bám bảng DSL ở trên — nó đối chiếu từ `.d.ts` thật trong `node_modules` |
| Viết SQL tay cho thứ vốn đã có decorator | Chỉ HNSW, GIN theo biểu thức và `CREATE EXTENSION` mới cần SQL thô. Còn lại dùng decorator |
| `synchronize: true` lọt vào môi trường nào đó | Synchronize không biết index HNSW và GIN-biểu-thức tồn tại → nó sẽ **xóa** chúng, và truy vấn vector lập tức quét toàn bảng. Test đọc config chặn lại |
| Toán tử `<=>` rải khắp code | Cô lập mọi truy vấn vector trong `vector.repository.ts`; chuẩn hoàn thành có bước grep |
| `migration:generate` sinh migration rác cho cột vector | Không dùng `migration:generate` cho phần vector/index — viết tay. Đây cũng là lý do `synchronize: false` |
| Tham số HNSW đặt sai → tìm kiếm chậm | Đã dựng với `m=16, ef_construction=64`. Chỉnh `hnsw.ef_search` theo số đo ở quy mô thật |
| **Chuẩn "dưới 100ms" đạt nhờ seq scan, index không hề chạy** | Chuẩn nghiệm thu phải khẳng định `EXPLAIN` hiện `Index Scan using idx_chunks_embedding`. Xem mục phát hiện ở trên |
| Xóa cascade bỏ sót thực thể mồ côi | Test riêng cho quy tắc xóa ở [mục 7](../../docs/data-model.md#7-quy-tắc-xóa) |

## Bảo mật
Mọi bảng chứa dữ liệu người dùng đều phải có `user_id`. Không bảng nào được truy vấn mà thiếu điều
kiện `user_id` — đây là ràng buộc sẽ được kiểm tra lại ở Phase 03. Entity chứa `password_hash` và
`token_hash` không bao giờ được trả thẳng ra controller.

## Tiếp theo
Mở khóa Phase 03 (xác thực) và Phase 11 (hạ tầng tác vụ).
