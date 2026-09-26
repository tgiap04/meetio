# Phase 12 · Chunking, embedding & tìm kiếm ngữ nghĩa

**Liên kết:** [plan.md](plan.md) · [US-22](../../user_stories.md#us-22--tìm-kiếm-ngữ-nghĩa-xuyên-các-cuộc-họp) ·
[Luồng 2](../../docs/system-architecture.md#3-luồng-2--pipeline-phân-tích)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ✅ **implemented — pending live Gemini verification** · **Phụ thuộc:** Phase 11

Cắt transcript thành chunk, nhúng vector, và mở tìm kiếm ngữ nghĩa xuyên mọi cuộc họp.

## Nhận định then chốt
- Bản đặc tả gốc sinh embedding nhưng chỉ tìm cuộc họp theo tên và ngày — có kho vector mà không
  dùng. Phase này trả lại giá trị đó.
- Chunk phải giữ được đường về `segment_start_seq`/`segment_end_seq`, nếu không thì mọi trích dẫn ở
  Phase 14 và 15 đều vô nghĩa.
- Chồng lấn giữa các chunk giữ cho câu bị cắt ngang không mất ngữ cảnh.
- Lọc `user_id` phải nằm **trong** câu lệnh tìm vector, không phải lọc sau khi đã lấy kết quả về.
- **⚠️ [DEVIATION] Tìm kiếm dùng EXACT SCAN, không HNSW** — xem [perf-2026-09-26-semantic-search.md](../reports/perf-2026-09-26-semantic-search.md). 
  HNSW + filtered WHERE khiến kết quả trống do budget scan dành cho người dùng khác; exact per-user scan 
  (`ORDER BY (embedding <=> q) + 0`) là 41–44ms trên 7.500 chunk (target), 294ms trên 50.000 chunk — 
  đều dưới NFR 2s. Xem lại (partitioning, pgvector filter) nếu một user vượt quá 100.000 chunk.

## Yêu cầu
**Chức năng:** cắt chunk theo token có chồng lấn; nhúng theo lô; endpoint tìm kiếm ngữ nghĩa xuyên
cuộc họp có lọc theo ngày; màn hình kết quả nhảy được tới đúng vị trí trong transcript.
**Phi chức năng:** tìm kiếm trên kho 500 cuộc họp trả về dưới 2 giây; nhúng theo lô để giảm lượt gọi.

## Kiến trúc
**Chunking:** Bộ cắt chunk gộp các `transcript_segments` liên tiếp đến khi chạm ~800 token, chồng lấn 15% với
chunk kế. Ranh giới ưu tiên rơi vào khoảng lặng dài hoặc mốc gián đoạn — cắt giữa câu là mất ý.
(Không dùng mốc đổi người nói: transcript không có thông tin đó — US-13 đã bỏ.) Khi transcript được sửa, 
chunking đổi phạm vi (`changed` scope) rẽ chỉ các chunk chứa đoạn sửa.

**Embedding:** Gộp 20 chunk mỗi lần gọi Gemini, ghi real token count từ `countTokens` 
vào `meeting_chunks.token_count`. Hỗ trợ nhiều khóa Gemini (comma-separated `GEMINI_API_KEY`) 
với round-robin rotation; 429 rest theo `retryDelay` (mặc định 60s) hoặc tới đầu ngày Pacific khi có 
daily quota error.

**Search:** Tìm kiếm dùng exact per-user scan trên `meeting_chunks.embedding` 
(không HNSW — xem nhận định), lọc `user_id`, soft-delete, khoảng ngày ngay trong câu `WHERE`. 
Phân trang theo `offset`/`limit`, không COUNT — một hàng thêm cho biết trang kế tồn tại.

## File liên quan
**Tạo — Backend:**
- `apps/api/src/chunking/chunker.ts` · `chunker.spec.ts` · `chunker-edge-cases.spec.ts` — bộ cắt chunk có chồng lấn
- `apps/api/src/chunking/chunk-step.handler.ts` — pipeline step `chunk` với reconciliation và scope `changed`
- `apps/api/src/chunking/embed-step.handler.ts` — pipeline step `embed` với batch 20 + real token count
- `apps/api/src/chunking/__tests__/chunk-embed.integration.spec.ts` · `fake-gemini.ts`
- `apps/api/src/search/search.service.ts` · `search.controller.ts` · `search.module.ts` (renamed từ `retrieval.module.ts`)
- `apps/api/src/search/dto/search.dto.ts`
- `apps/api/src/search/__tests__/vector-search.integration.spec.ts` · `search.e2e.spec.ts` · `search-boundary-cases.spec.ts`
- `apps/api/src/ai/gemini-key-pool.ts` · `gemini-key-pool.spec.ts` · `gemini-key-pool-edge-cases.spec.ts` — key rotation
- Migration `1758000000015-SplitChunkingFromEmbedding.ts`

**Tạo — Mobile:**
- `apps/mobile/app/(app)/(tabs)/search.tsx` — màn tìm kiếm với Transcript + Meeting chips (Node, Người ẩn)
- `apps/mobile/src/components/search/search-header.tsx` · `search-result-section.tsx` · `semantic-result-row.tsx` · `load-more-button.tsx`
- `apps/mobile/src/api/search.ts` · `apps/mobile/src/hooks/use-search-query.ts`

**Sửa:**
- `apps/api/src/database/vector.repository.ts` — `searchChunks` với exact scan + filters
- `apps/api/src/ai/gemini.client.ts` — track usage, rotate keys
- `apps/api/src/database/entities/meeting-chunk.entity.ts` — add fields

## Các bước thực hiện
1. `chunker.ts`: gộp segment theo ngưỡng token, chồng lấn 15%, ưu tiên cắt ở khoảng lặng dài.
2. `chunk.processor`: ghi `meeting_chunks` kèm `segment_start_seq`, `segment_end_seq`, `token_count`, `user_id`.
3. `embed.processor`: nhúng theo lô 20 chunk mỗi lượt, ghi `usage_records`.
4. `search.service`: nhúng truy vấn → tìm tương đồng có lọc `user_id` và khoảng ngày → trả đoạn trích.
5. `GET /search` phân trang, mỗi kết quả kèm tên cuộc họp, ngày, `segment_seq` để nhảy tới.
6. Màn hình tìm kiếm trên mobile: ô nhập có trễ gõ, thẻ kết quả, chạm để nhảy đúng vị trí.
7. Đo hiệu năng với 500 cuộc họp giả lập (~7.500 chunk), chỉnh tham số HNSW theo số đo.

## Todo
- [x] Bộ cắt chunk có chồng lấn và ranh giới theo khoảng lặng (chunker.ts)
- [x] chunk-step.handler giữ liên kết truy vết + reconciliation (segment_start_seq/segment_end_seq, content_hash)
- [x] embed-step.handler nhúng theo lô 20 + ghi token_count thực (countTokens)
- [x] search.service lọc quyền trong câu lệnh SQL (user_id WHERE, soft-delete, date filter)
- [x] GET /search phân trang với next_offset (không COUNT)
- [x] Màn hình tìm kiếm + nhảy tới vị trí (search.tsx, semantic-result-row.tsx, router.push MEETING_TRANSCRIPT_ROUTE)
- [x] Đo hiệu năng: 41–44ms @ 7.500 chunk, 294ms @ 50.000 chunk (exact scan, không HNSW)
- [x] Gemini key pool: round-robin rotation, 429 rest, daily quota handling
- [x] Test: chunker spec + integration (chunk-embed.integration.spec.ts), search e2e + boundary (search.e2e.spec.ts)

## Chuẩn hoàn thành
- Cuộc họp 60 phút cắt và nhúng xong trong 90 giây.
- Tìm theo ý ("bàn về ngân sách quý sau") ra đúng đoạn dù không trùng từ nào.
- Kết quả về dưới 2 giây trên kho 500 cuộc họp — ✅ **44ms @ 7.500 chunk (target), 294ms @ 50.000 chunk**
- Người dùng A tìm không bao giờ thấy dữ liệu của B — ✅ có test riêng (`search-boundary-cases.spec.ts`)
- Chạm kết quả nhảy đúng tới đoạn transcript tương ứng — ✅ `segment_seq` trong response, router.push

## Design deviations từ plan gốc
1. **Search: exact per-user scan thay vì HNSW** — Đo thực tế (perf-2026-09-26-semantic-search.md) cho thấy HNSW + filtered WHERE 
   (người dùng cụ thể) trả về kết quả trống do budget scan dành cho người dùng khác và dead index entries. 
   Exact scan (`ORDER BY (embedding <=> q) + 0`) không dùng HNSW, mà vượt qua `idx_chunks_user` 
   và heapsort — luôn đầy đủ, nhanh đủ (44ms target, 294ms @ 50k chunks). 
   Xem lại nếu một user vượt 100k chunks.

2. **Gemini API key rotation — comma-separated keys với round-robin** — `GEMINI_API_KEY=k1,k2,k3` trong .env; 
   GeminiKeyPool quay vòng lần lượt, bỏ qua khóa đang rest. 
   429 error → rest khóa theo `retryDelay` Gemini (mặc định 60s), 
   hoặc tới đầu ngày Pacific nếu daily quota hết. 
   API_KEY_INVALID → tắt vĩnh viễn. 
   Khóa không bao giờ vào log/DB, chỉ vị trí 1-based. 
   (Phân tích chi tiết: clarifications 2026-09-26, gemini-key-pool.ts, cooldownFor logic)

3. **Mobile UI: ẩn Node chip và nhóm Người** — Design ban đầu có 3 chip (Tất cả, Transcript, Meeting, Node) 
   và 2 nhóm results (Người, Tài liệu). Phase 12 ẩn Node và Người (chờ Phase 13 trích đồ thị + entity resolution). 
   Tài liệu mock bị bỏ; Transcript section dùng real `GET /search`. 
   (clarifications 2026-09-26, search.tsx CHIPS array)

## Rủi ro & Đối sách
| Rủi ro | Đối sách | Trạng thái |
|--------|----------|-----------|
| Chunk quá to làm trích dẫn thiếu chính xác | Đặt ngưỡng token là cấu hình; đo chất lượng trích dẫn ở Phase 15 | Chưa phát sinh |
| Exact scan chậm khi user có nhiều chunk | Xem lại partitioning/pgvector filter nếu > 100k chunk/user | Đo @ 50k, still 294ms |
| Nhúng lô lớn chạm giới hạn tần suất API | Lô 20 + GeminiKeyPool rotation + rate-limit trong GeminiClient | Thiết kế sẵn |
| GEMINI_API_KEY trống hoặc chưa đúng | Cần user điền GEMINI_API_KEY; không chạy `yarn workspace @meetio/api gemini:check` → API fails | Pending user action |

## Bảo mật
- Điều kiện `user_id` nằm trong câu lệnh SQL, không phải bộ lọc ở tầng ứng dụng. Có test xác nhận (`search-boundary-cases.spec.ts`).
- Gemini keys không bao giờ vào log hoặc DB — chỉ lưu vị trí 1-based trong `usage_records`.
- Embedding + token count không log prompt/response — chỉ log token count và operation label.

## Kiểm chứng & Số đo
**Test results (orchestrator 2026-09-26):**
- API: unit 310, e2e 87, schema 5 — tất cả exit 0
- Mobile: 797 — tất cả exit 0
- Typecheck: clean · Eslint: clean

**Reviewer score:** 8/10, decision REWORK
- Lý do duy nhất: unproven live checks — cần user điền `GEMINI_API_KEY` + chạy `yarn workspace @meetio/api gemini:check`

**Perf baseline:** Xem [perf-2026-09-26-semantic-search.md](../reports/perf-2026-09-26-semantic-search.md)
- 7.500 chunk/user (target): p50 41.4ms, p95 43.6ms
- 50.000 chunk/user: p50 293.6ms, p95 299.4ms
- Cả hai dưới NFR 2s

## Tiếp theo
Mở khóa Phase 13 (trích xuất đồ thị) và Phase 14 (tóm tắt). 
Phase 12 có thể chuyển sang status "completed" sau khi người dùng:
1. Điền `GEMINI_API_KEY` vào .env
2. Chạy `yarn workspace @meetio/api gemini:check` và xác nhận live embedding hoạt động
