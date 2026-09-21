# Phase 12 · Chunking, embedding & tìm kiếm ngữ nghĩa

**Liên kết:** [plan.md](plan.md) · [US-22](../../user_stories.md#us-22--tìm-kiếm-ngữ-nghĩa-xuyên-các-cuộc-họp) ·
[Luồng 2](../../docs/system-architecture.md#3-luồng-2--pipeline-phân-tích)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 11

Cắt transcript thành chunk, nhúng vector, và mở tìm kiếm ngữ nghĩa xuyên mọi cuộc họp.

## Nhận định then chốt
- Bản đặc tả gốc sinh embedding nhưng chỉ tìm cuộc họp theo tên và ngày — có kho vector mà không
  dùng. Phase này trả lại giá trị đó.
- Chunk phải giữ được đường về `segment_start_seq`/`segment_end_seq`, nếu không thì mọi trích dẫn ở
  Phase 14 và 15 đều vô nghĩa.
- Chồng lấn giữa các chunk giữ cho câu bị cắt ngang không mất ngữ cảnh.
- Lọc `user_id` phải nằm **trong** câu lệnh tìm vector, không phải lọc sau khi đã lấy kết quả về.
- **⚠️ Mang từ Phase 02: planner KHÔNG tự chọn index HNSW ở quy mô nhỏ.** Đo thật trên 10.003 chunk:
  planner chọn `Seq Scan` (20,7ms); ép `enable_seqscan=off` thì dùng `Index Scan using
  idx_chunks_embedding` (**0,245ms — nhanh hơn 80 lần**). Seq scan tăng tuyến tính, nên 1 triệu chunk
  sẽ mất khoảng 2 giây. **Mọi phép đo hiệu năng vector ở phase này phải khẳng định `EXPLAIN` hiện
  `Index Scan`, không chỉ đo thời gian** — xem [Phase 02](phase-02-database-schema.md).

## Yêu cầu
**Chức năng:** cắt chunk theo token có chồng lấn; nhúng theo lô; endpoint tìm kiếm ngữ nghĩa xuyên
cuộc họp có lọc theo ngày; màn hình kết quả nhảy được tới đúng vị trí trong transcript.
**Phi chức năng:** tìm kiếm trên kho 500 cuộc họp trả về dưới 2 giây; nhúng theo lô để giảm lượt gọi.

## Kiến trúc
Bộ cắt chunk gộp các `transcript_segments` liên tiếp đến khi chạm ~800 token, chồng lấn 15% với
chunk kế. Ranh giới ưu tiên rơi vào khoảng lặng dài hoặc mốc gián đoạn — cắt giữa câu là mất ý.
(Không dùng mốc đổi người nói: transcript không có thông tin đó — US-13 đã bỏ.)

Tìm kiếm dùng index HNSW trên `meeting_chunks.embedding`, lọc `user_id` ngay trong câu `WHERE`.

## File liên quan
**Tạo:** `apps/api/src/jobs/processors/chunk.processor.ts` · `processors/embed.processor.ts` ·
`apps/api/src/chunking/chunker.ts` · `apps/api/src/search/search.module.ts` ·
`search/search.service.ts` · `search/search.controller.ts` ·
`apps/mobile/app/(app)/search.tsx` · `src/components/search-result-card.tsx`
**Sửa:** `apps/api/src/database/vector.repository.ts`

## Các bước thực hiện
1. `chunker.ts`: gộp segment theo ngưỡng token, chồng lấn 15%, ưu tiên cắt ở khoảng lặng dài.
2. `chunk.processor`: ghi `meeting_chunks` kèm `segment_start_seq`, `segment_end_seq`, `token_count`, `user_id`.
3. `embed.processor`: nhúng theo lô 20 chunk mỗi lượt, ghi `usage_records`.
4. `search.service`: nhúng truy vấn → tìm tương đồng có lọc `user_id` và khoảng ngày → trả đoạn trích.
5. `GET /search` phân trang, mỗi kết quả kèm tên cuộc họp, ngày, `segment_seq` để nhảy tới.
6. Màn hình tìm kiếm trên mobile: ô nhập có trễ gõ, thẻ kết quả, chạm để nhảy đúng vị trí.
7. Đo hiệu năng với 500 cuộc họp giả lập (~7.500 chunk), chỉnh tham số HNSW theo số đo.

## Todo
- [ ] Bộ cắt chunk có chồng lấn và ranh giới theo khoảng lặng
- [ ] chunk.processor giữ liên kết truy vết
- [ ] embed.processor nhúng theo lô
- [ ] search.service lọc quyền trong câu lệnh
- [ ] GET /search phân trang
- [ ] Màn hình tìm kiếm + nhảy tới vị trí
- [ ] Đo hiệu năng trên 7.500 chunk

## Chuẩn hoàn thành
- Cuộc họp 60 phút cắt và nhúng xong trong 90 giây.
- Tìm theo ý ("bàn về ngân sách quý sau") ra đúng đoạn dù không trùng từ nào.
- Kết quả về dưới 2 giây trên kho 500 cuộc họp.
- Người dùng A tìm không bao giờ thấy dữ liệu của B — có test riêng cho điều này.
- Chạm kết quả nhảy đúng tới đoạn transcript tương ứng.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Chunk quá to làm trích dẫn thiếu chính xác | Đặt ngưỡng token là cấu hình; đo chất lượng trích dẫn ở Phase 15 |
| HNSW cho kết quả xấp xỉ, sót kết quả đúng | Chỉnh `ef_search`; đo recall trên bộ truy vấn vàng |
| Nhúng lô lớn chạm giới hạn tần suất API | Lô 20 + giới hạn tần suất trong GeminiClient |

## Bảo mật
Điều kiện `user_id` nằm trong câu lệnh SQL, không phải bộ lọc ở tầng ứng dụng. Có test xác nhận.

## Tiếp theo
Mở khóa Phase 13 (trích xuất đồ thị) và Phase 14 (tóm tắt).
