# Phase 15 · Hỏi đáp GraphRAG

**Liên kết:** [plan.md](plan.md) · [US-35→37](../../user_stories.md#e6--đồ-thị-tri-thức--hỏi-đáp) ·
[Luồng 3](../../docs/system-architecture.md#4-luồng-3--truy-hồi-và-hỏi-đáp-graphrag)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ✅ **implemented — live Gemini verified; pending gold question set** · **Phụ thuộc:** Phase 13

Tính năng khác biệt của sản phẩm: hỏi bằng ngôn ngữ tự nhiên, trả lời có trích dẫn, xuyên nhiều cuộc họp.

## Nhận định then chốt
- Bản đặc tả gốc không mô tả luồng truy hồi một dòng nào, dù đây là lý do tồn tại của cả kiến trúc
  GraphRAG. Phase này là chỗ hiện thực hóa [Luồng 3](../../docs/system-architecture.md#4-luồng-3--truy-hồi-và-hỏi-đáp-graphrag).
- Hai điểm neo song song — chunk và thực thể — rồi mở rộng một bậc trên đồ thị. Chỉ tìm vector thuần
  thì chẳng khác gì RAG thường, và phần "Graph" thành thừa.
- **Không có ngữ cảnh thì không gọi LLM.** Gọi rồi bảo nó "đừng bịa" là đặt cược vào lời hứa của mô hình.
- Trích dẫn là bắt buộc, không phải trang trí. Câu trả lời không dẫn được nguồn phải bị hạ độ tin cậy.
- **Neo chunk: quét chính xác per-user, không HNSW.** Thực tế từ Phase 12: HNSW + lọc user trả trang rỗng;
  quét chính xác đo 41–44ms trên 10k chunk. Không thêm index HNSW.

## Yêu cầu
**Chức năng:** hỏi trong một cuộc họp; hỏi xuyên cuộc họp có lọc thời gian và lọc theo thực thể; giữ
lịch sử hội thoại; hiểu câu hỏi tham chiếu lượt trước; trích dẫn chạm được để nhảy tới transcript.
**Phi chức năng:** trả lời dưới 5 giây; tối đa 30 câu hỏi/giờ/người dùng.

## Kiến trúc
`RetrievalService` chạy đúng sáu bước của Luồng 3: nhúng câu hỏi → tìm neo song song (10 chunk + 5
thực thể) → mở rộng một bậc trên đồ thị → gom, khử trùng, xếp hạng, cắt còn ~6.000 token → gọi LLM
kèm 5 lượt hội thoại gần nhất → trả kết quả có trích dẫn.

Ngưỡng tương đồng tối thiểu chặn ở bước 2: không chunk nào vượt ngưỡng thì trả thẳng "không tìm
thấy", `citations: []`, `confidence: 0`, và **không** gọi LLM.

## File liên quan
**Tạo:** `apps/api/src/qa/qa.module.ts` · `qa/retrieval.service.ts` · `qa/graph-expander.ts` ·
`qa/context-builder.ts` · `qa/qa.controller.ts` ·
`apps/mobile/app/(app)/meetings/[id]/chat.tsx` · `app/(app)/ask.tsx` ·
`src/components/citation-chip.tsx`

## Các bước thực hiện
1. `retrieval.service`: nhúng câu hỏi, tìm song song trên `meeting_chunks` và `entities`.
2. `graph-expander`: từ thực thể neo đi một bậc quan hệ, lấy các chunk sinh ra quan hệ đó.
3. `context-builder`: hợp nhất, khử trùng, xếp hạng lại, cắt theo hạn mức token.
4. Ngưỡng chặn: dưới ngưỡng thì trả "không tìm thấy" mà không gọi LLM.
5. Prompt sinh câu trả lời bắt buộc trả `chunk_ids` làm trích dẫn.
6. Lưu `qa_messages` kèm trích dẫn, độ tin cậy và số token.
7. Ngữ cảnh hội thoại: đưa 5 lượt gần nhất vào prompt để hiểu câu hỏi tham chiếu.
8. `POST /meetings/:id/qa` lọc theo `meeting_id`; `POST /qa` lọc theo `user_id` kèm khoảng thời gian
   và `entity_id` tùy chọn.
9. Màn hình chat: hai cấp độ (trong cuộc họp và toàn cục), trích dẫn dạng chip chạm để nhảy tới nguồn.
10. Bộ câu hỏi vàng (30 câu trên 10 cuộc họp thật) để đo chất lượng trả lời và độ đúng của trích dẫn.

## Todo
- [x] Tìm neo song song chunk + thực thể
- [x] Mở rộng một bậc trên đồ thị
- [x] Gom, khử trùng, xếp hạng, cắt ngữ cảnh
- [x] Ngưỡng chặn không gọi LLM khi thiếu ngữ cảnh
- [x] Prompt bắt buộc trả trích dẫn
- [x] Lưu lịch sử hỏi đáp
- [x] Ngữ cảnh 5 lượt hội thoại gần nhất
- [x] Hai endpoint hỏi đáp có lọc phạm vi
- [x] Màn hình chat + chip trích dẫn
- [ ] Bộ câu hỏi vàng và đo chất lượng (chưa bắt đầu: chờ 10 cuộc họp thật từ người dùng)

## Chuẩn hoàn thành
- Trả lời dưới 5 giây ở phân vị 95 với cuộc họp 2 giờ.
- Câu hỏi xuyên cuộc họp trích dẫn được nguồn từ nhiều cuộc họp khác nhau.
- Câu hỏi ngoài phạm vi dữ liệu nhận câu trả lời "không tìm thấy", không có câu bịa nào.
- Mọi trích dẫn chạm được và nhảy đúng đoạn transcript.
- Trên bộ câu hỏi vàng: trích dẫn đúng trên 90%, không có trường hợp bịa nào lọt qua.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Mở rộng đồ thị kéo về quá nhiều ngữ cảnh nhiễu | Giới hạn một bậc; xếp hạng lại trước khi cắt |
| LLM bịa dù đã có ngữ cảnh | Ngưỡng chặn + bắt buộc trích dẫn + bộ câu hỏi vàng làm hàng rào kiểm chứng |
| Hỏi xuyên cuộc họp chậm khi kho lớn | Đo trên 500 cuộc họp; chỉnh `ef_search` và số lượng neo |

## Bảo mật
Mọi truy vấn lọc `user_id` ngay trong câu lệnh. Có test xác nhận không rò dữ liệu chéo người dùng.
Không log câu hỏi và câu trả lời ở production.

## Tiếp theo
Không chặn phase nào. Phase 16 và 17 bao phủ phần còn lại.

## Thiết kế thi công (2026-09-26)
Quyết định người dùng: [clarifications.md › Phase 15](clarifications.md). Hợp đồng: `packages/shared/src/qa/qa.types.ts`.

**Migration 018** — `qa_messages`: `not_found boolean`, `filters jsonb`.

**Truy hồi** (`apps/api/src/qa/`): câu tìm = câu hiện tại (+ câu hỏi liền trước nếu có). Nhúng song song
RETRIEVAL_QUERY (so với chunk) và SEMANTIC_SIMILARITY (so với thực thể). Neo: 10 chunk gần nhất trong phạm vi
(cuộc họp / người dùng + thời gian + thực thể) — **quét chính xác** như `/search` (HNSW + lọc user trả trang rỗng,
đã đo ở Phase 12; ghi chú "phải thấy Index Scan" trong phase này đã lỗi thời). 5 thực thể neo = thực thể có tên/bí
danh xuất hiện trong câu hỏi + gần nhất theo vector. Mở rộng 1 bậc: quan hệ của thực thể neo → chunk sinh ra quan hệ,
cộng chunk nhắc tới thực thể neo. Gom, khử trùng, xếp hạng (điểm neo, chunk mở rộng nhân hệ số), cắt ~6.000 token,
sắp theo ngày họp + seq, gắn nhãn S1..Sn kèm tên/ngày họp.

**Chặn:** không chunk neo nào ≥ `QA_MIN_SIMILARITY` và không có thực thể khớp tên → trả "không tìm thấy",
`confidence 0`, không gọi LLM (ngưỡng hiệu chỉnh bằng lượt kiểm thật).

**Sinh:** `responseSchema {not_found, answer, sources[], confidence}`; 5 lượt gần nhất của cùng luồng; nhãn nguồn
lạ → loại; trả lời không còn nguồn hợp lệ → `low_confidence`. Model tự báo không tìm thấy → như chặn. Ngôn ngữ =
ngôn ngữ câu hỏi. Đo: gemini-2.5-flash ~2.2–2.9s với ngữ cảnh 5.7k token.

**API:** `POST/GET/DELETE /meetings/:id/qa` (409 MEETING_NOT_READY khi chưa có chunk nhúng), `POST/GET/DELETE /qa`
(một luồng toàn cục, `meeting_id` NULL). 30 câu/giờ/người dùng cho hai POST. Trích dẫn lưu `{chunk_id, meeting_id}`,
dựng lại khi đọc (chunk đã bị cắt lại → `available: false`). Không log câu hỏi/câu trả lời.

**Mobile** (implementer): màn chat trong cuộc họp (nút nổi "Hỏi AI" ở chi tiết cuộc họp), chat toàn cục (dòng Home)
có bộ lọc thời gian + thực thể, nút "Hỏi về thực thể này" ở chi tiết thực thể mở chat toàn cục đã chọn sẵn thực thể;
chip trích dẫn (tên + ngày họp) chạm → transcript `?seq=`; cảnh báo độ tin cậy thấp; "không tìm thấy" hiển thị rõ.

**Chưa làm được bằng code:** bộ câu hỏi vàng 30 câu trên 10 cuộc họp thật (cần dữ liệu người dùng).

## Kết quả triển khai (2026-09-26)

**Kiểm chứng thực tế — live Gemini:**
- Latency p95: 3.1s (120 phút) + 3.8s (20 phút synthetic) — NFR < 5s ✓
- Độ chính xác: 6/6 câu trả lời đúng với trích dẫn chính xác ✓
- Out-of-scope: 4/4 trả "không tìm thấy" ✓
- Xuyên cuộc họp: trích dẫn từ cả hai cuộc họp ✓
- Câu hỏi tham chiếu: hiểu được (ghép câu liền trước vào tìm kiếm) ✓
- Tương đồng chunks: 0.61–0.76 (có), 0.55–0.59 (không) — ngưỡng QA_MIN_SIMILARITY 0.6 hẹp ⚠️
- Test: API 387 unit + 130 e2e + 5 schema · mobile 1.051 ✓
- Reviewer: 8/10, zero critical issues ✓

**Lệch so với thiết kế:**
1. **Neo chunk:** quét chính xác per-user (đã ghi lại ở "Nhận định"); HNSW + lọc user trả rỗng (Phase 12)
2. **Neo thực thể:** tên xuất hiện + vector; accent-aware ("cuối tuần" ≠ "Tuấn")
3. **Câu hỏi tham chiếu:** tìm với câu hiện tại + câu trước; không gọi rewrite (quyết định người dùng)
   - Đánh đổi: câu hỏi không liên quan sau một câu hợp lệ vẫn vượt ngưỡng, model báo "không tìm thấy"
4. **Luồng hội thoại:** một luồng toàn cục (không per-meeting)
5. **Màn hình mobile:** `meeting-chat.tsx` (trong cuộc họp), `ask.tsx` (toàn cục); không `meetings/[id]/chat.tsx`
6. **Lọc ngày:** `to` chỉ ngày (DD/MM/YYYY) = cả ngày theo Asia/Ho_Chi_Minh
7. **Bug fixed:** duplicate chat turns sau history refetch

**Bước tiếp:** Đợi 10 cuộc họp thật + 30 câu hỏi từ người dùng để kiểm chứng bộ dữ liệu vàng và hiệu chỉnh QA_MIN_SIMILARITY.
