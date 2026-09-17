# Phase 14 · Tóm tắt & việc cần làm

**Liên kết:** [plan.md](plan.md) · [US-31→34](../../user_stories.md#e5--pipeline-ai--kết-quả)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 12, 13

Tóm tắt điều hành có dẫn nguồn, và danh sách việc cần làm có cấu trúc, sửa được, theo dõi được.

## Nhận định then chốt
- Mỗi ý trong tóm tắt phải dẫn được về chunk nguồn. Tóm tắt không kiểm chứng được thì người dùng
  không dám tin, và không dám tin thì tính năng vô dụng.
- Không có tách người nói → gán người phụ trách sẽ sai. **Không xác định được thì để trống**, tuyệt
  đối không đoán. Đây là [OQ-02](../../user_stories.md#5-câu-hỏi-còn-mở).
- `action_items` là bảng riêng, không phải JSONB. Chính nó mở ra màn hình "việc của tôi" ở US-34.
- Cuộc họp quá ngắn hoặc không có nội dung thì nói thẳng, không nặn ra tóm tắt cho có.

## Yêu cầu
**Chức năng:** tóm tắt điều hành có trích dẫn; trích xuất action item kèm người phụ trách và hạn;
sửa tay mọi trường; thêm thủ công; đánh dấu hoàn thành; màn hình tổng hợp xuyên cuộc họp có lọc.
**Phi chức năng:** tóm tắt cuộc họp 60 phút dưới 60 giây; tóm tắt bằng đúng ngôn ngữ của cuộc họp.

## Kiến trúc
`summarize.processor` nhận toàn bộ transcript. Cuộc họp dài vượt cửa sổ ngữ cảnh thì tóm tắt hai
tầng: tóm tắt từng nhóm chunk trước, rồi tổng hợp lại.

Người phụ trách được nối vào `entities` qua `assignee_entity_id` — nhờ đó lọc theo người ở US-34
chạy trên đồ thị chứ không phải so chuỗi.

## File liên quan
**Tạo:** `apps/api/src/jobs/processors/summarize.processor.ts` ·
`apps/api/src/summaries/summary.service.ts` · `apps/api/src/actions/actions.module.ts` ·
`actions/actions.controller.ts` · `actions/actions.service.ts` ·
`apps/mobile/app/(app)/meetings/[id]/summary.tsx` · `app/(app)/actions.tsx` ·
`src/components/action-item-row.tsx`

## Các bước thực hiện
1. Prompt tóm tắt bắt buộc trả JSON: `{summary_points: [{text, chunk_ids}], decisions, action_items}`.
2. Tóm tắt hai tầng cho cuộc họp dài vượt cửa sổ ngữ cảnh.
3. Ghi `meetings.summary` và `summary_citations`.
4. Trích action item: nội dung, người phụ trách, hạn, `source_chunk_id`.
5. Nối người phụ trách vào `entities` loại `person`; không chắc chắn thì để `NULL`.
6. Endpoint action item: đọc theo cuộc họp, đọc tổng hợp có lọc, thêm tay, sửa, xóa.
7. Màn hình tóm tắt: từng ý chạm được để nhảy tới transcript nguồn.
8. Màn hình việc cần làm: tổng hợp toàn bộ, lọc theo người và cuộc họp, tick hoàn thành, việc xong
   xuống cuối danh sách.
9. Đo độ chính xác gán người phụ trách trên bộ dữ liệu vàng của Phase 13 → đóng OQ-02.

## Todo
- [ ] Prompt tóm tắt có trích dẫn bắt buộc
- [ ] Tóm tắt hai tầng cho cuộc họp dài
- [ ] Ghi summary + summary_citations
- [ ] Trích action item có cấu trúc
- [ ] Nối người phụ trách vào entities
- [ ] Endpoint action item đầy đủ
- [ ] Màn hình tóm tắt có nhảy tới nguồn
- [ ] Màn hình tổng hợp việc cần làm
- [ ] Đo độ chính xác gán người (đóng OQ-02)

## Chuẩn hoàn thành
- Mọi ý trong tóm tắt có ít nhất một `chunk_id`, chạm vào nhảy đúng chỗ.
- Tóm tắt cuộc họp 60 phút xong dưới 60 giây.
- Cuộc họp 2 phút không có nội dung thì trả lời thẳng là không đủ để tóm tắt.
- Không xác định được người phụ trách thì để trống — có test chống việc đoán bừa.
- Màn hình tổng hợp lọc đúng theo người và theo cuộc họp.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Tóm tắt bịa nội dung không có trong cuộc họp | Bắt buộc `chunk_ids` cho từng ý; ý không dẫn được nguồn thì loại |
| Gán người phụ trách sai do thiếu diarization | Thà để trống còn hơn gán sai; đo và ghi nhận ở OQ-02 |
| Tóm tắt hai tầng làm mất ý quan trọng | So sánh với tóm tắt một tầng trên cuộc họp ngắn để kiểm chứng |

## Bảo mật
Không log nội dung prompt tóm tắt. Action item kế thừa quyền sở hữu từ cuộc họp.

## Tiếp theo
Chạy song song với Phase 15.
