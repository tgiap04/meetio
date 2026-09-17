# Phase 15 · Hỏi đáp GraphRAG

**Liên kết:** [plan.md](plan.md) · [US-35→37](../../user_stories.md#e6--đồ-thị-tri-thức--hỏi-đáp) ·
[Luồng 3](../../docs/system-architecture.md#4-luồng-3--truy-hồi-và-hỏi-đáp-graphrag)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 13

Tính năng khác biệt của sản phẩm: hỏi bằng ngôn ngữ tự nhiên, trả lời có trích dẫn, xuyên nhiều cuộc họp.

## Nhận định then chốt
- Bản đặc tả gốc không mô tả luồng truy hồi một dòng nào, dù đây là lý do tồn tại của cả kiến trúc
  GraphRAG. Phase này là chỗ hiện thực hóa [Luồng 3](../../docs/system-architecture.md#4-luồng-3--truy-hồi-và-hỏi-đáp-graphrag).
- Hai điểm neo song song — chunk và thực thể — rồi mở rộng một bậc trên đồ thị. Chỉ tìm vector thuần
  thì chẳng khác gì RAG thường, và phần "Graph" thành thừa.
- **Không có ngữ cảnh thì không gọi LLM.** Gọi rồi bảo nó "đừng bịa" là đặt cược vào lời hứa của mô hình.
- Trích dẫn là bắt buộc, không phải trang trí. Câu trả lời không dẫn được nguồn phải bị hạ độ tin cậy.

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
- [ ] Tìm neo song song chunk + thực thể
- [ ] Mở rộng một bậc trên đồ thị
- [ ] Gom, khử trùng, xếp hạng, cắt ngữ cảnh
- [ ] Ngưỡng chặn không gọi LLM khi thiếu ngữ cảnh
- [ ] Prompt bắt buộc trả trích dẫn
- [ ] Lưu lịch sử hỏi đáp
- [ ] Ngữ cảnh 5 lượt hội thoại gần nhất
- [ ] Hai endpoint hỏi đáp có lọc phạm vi
- [ ] Màn hình chat + chip trích dẫn
- [ ] Bộ câu hỏi vàng và đo chất lượng

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
