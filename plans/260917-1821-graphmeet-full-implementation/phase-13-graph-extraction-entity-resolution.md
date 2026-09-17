# Phase 13 · Trích xuất đồ thị & khớp thực thể

**Liên kết:** [plan.md](plan.md) · [US-38→41](../../user_stories.md#e6--đồ-thị-tri-thức--hỏi-đáp) ·
[Khớp thực thể](../../docs/system-architecture.md#5-khớp-và-gộp-thực-thể)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 12

Rút thực thể và quan hệ từ transcript, khớp vào đồ thị dùng chung toàn tài khoản, và cho người dùng
sửa chữa những gì máy hiểu sai.

## Nhận định then chốt
- Đồ thị thuộc phạm vi **người dùng**, không phải cuộc họp. Đây là quyết định thay đổi bản chất sản
  phẩm — nó mở ra hỏi đáp xuyên cuộc họp, nhưng bắt phải giải bài toán khớp thực thể.
- Khớp sai thì đồ thị hỏng dần và không tự phục hồi. "Anh Bình", "Bình", "anh Bình" phải về một mối.
- Ngưỡng tương đồng là câu hỏi mở [OQ-03](../../user_stories.md#5-câu-hỏi-còn-mở) — phải hiệu chỉnh
  trên dữ liệu thật, và phải là cấu hình, không được hardcode.
- Quyết định của người dùng là tối thượng: `is_user_edited` thì pipeline không được ghi đè.

## Yêu cầu
**Chức năng:** trích xuất thực thể và quan hệ trả về JSON đúng schema; khớp ba tầng (chính xác →
vector → người dùng); đề xuất gộp; gộp và tách; sửa và xóa thực thể; màn hình duyệt đồ thị và dòng
thời gian thực thể.
**Phi chức năng:** trích xuất cuộc họp 60 phút dưới 2 phút; sai schema thì thử lại tối đa 2 lần rồi bỏ chunk.

## Kiến trúc
`extract.processor` đưa từng chunk vào LLM với schema JSON bắt buộc. `resolve.processor` nhận kết
quả và chạy ba tầng khớp ở [mục 5 kiến trúc](../../docs/system-architecture.md#5-khớp-và-gộp-thực-thể).

Chuẩn hóa tên: bỏ dấu, thường hóa, gỡ kính ngữ (anh/chị/ông/bà/em) → `normalized_name`. Đây là tầng
lọc rẻ nhất và bắt được phần lớn trường hợp trùng.

## File liên quan
**Tạo:** `apps/api/src/jobs/processors/extract.processor.ts` · `processors/resolve.processor.ts` ·
`apps/api/src/graph/graph.module.ts` · `graph/entity-resolver.ts` · `graph/name-normalizer.ts` ·
`graph/graph.controller.ts` · `apps/mobile/app/(app)/entities/index.tsx` ·
`app/(app)/entities/[id].tsx` · `src/components/merge-suggestion-card.tsx`

## Các bước thực hiện
1. Prompt trích xuất kèm schema JSON cho `entities[]` và `relations[]`, có kiểm định schema chặt.
2. Sai schema → thử lại tối đa 2 lần; vẫn hỏng thì bỏ chunk đó và ghi log, không làm hỏng cả cuộc họp.
3. `name-normalizer`: bỏ dấu, thường hóa, gỡ kính ngữ.
4. `entity-resolver` tầng 1: khớp chính xác theo `(user_id, normalized_name, type)`.
5. Tầng 2: tương đồng cosine trên embedding; trên ngưỡng cao thì tự gắn, vùng giữa thì tạo đề xuất gộp.
6. Ghi `entity_mentions` cho mỗi lần xuất hiện, giữ `surface_form` nguyên văn.
7. Ghi `relations` kèm `meeting_id`, `chunk_id`, `confidence` — cùng quan hệ ở nhiều cuộc họp thì
   nhiều dòng, đó là tín hiệu độ tin cậy.
8. Endpoint đồ thị: liệt kê, chi tiết, dòng thời gian, sửa, xóa, gộp, tách, bác bỏ đề xuất.
9. `entity_merge_rejections` chặn đề xuất lặp lại cặp đã bị bác bỏ.
10. Màn hình mobile: danh sách thực thể theo loại, chi tiết có quan hệ và dòng thời gian, luồng duyệt gộp.
11. Dựng bộ dữ liệu vàng gán tay từ 10 cuộc họp thật để hiệu chỉnh ngưỡng và đóng OQ-03.

## Todo
- [ ] Prompt trích xuất + kiểm định schema
- [ ] Xử lý sai schema có thử lại và bỏ qua
- [ ] Chuẩn hóa tên tiếng Việt
- [ ] Khớp ba tầng
- [ ] Ghi entity_mentions và relations
- [ ] Endpoint đồ thị đầy đủ
- [ ] Bảng chặn đề xuất đã bác bỏ
- [ ] Màn hình thực thể + dòng thời gian + duyệt gộp
- [ ] Bộ dữ liệu vàng và hiệu chỉnh ngưỡng (đóng OQ-03)

## Chuẩn hoàn thành
- Cùng một dự án nhắc ở 3 cuộc họp cho ra **một** thực thể có 3 mention.
- Trích xuất cuộc họp 60 phút dưới 2 phút.
- Trên bộ dữ liệu vàng: độ chính xác khớp trên 85%, tỉ lệ gộp nhầm dưới 5%.
- Gộp tay rồi thì tên cũ vẫn tìm ra được qua `aliases`.
- Thực thể có `is_user_edited` không bị lần chạy sau ghi đè.
- Cặp đã bác bỏ không bao giờ được đề xuất lại.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Ngưỡng sai → đồ thị rác hoặc đầy bản trùng | Bộ dữ liệu vàng + ngưỡng là cấu hình; đo trước khi chốt |
| LLM bịa quan hệ không có trong transcript | Bắt buộc mọi quan hệ kèm `chunk_id`; không dẫn được nguồn thì loại |
| Đồ thị phình theo thời gian | Theo dõi số thực thể mỗi người dùng; có công cụ dọn thực thể mồ côi |

## Bảo mật
Mọi truy vấn đồ thị lọc theo `user_id`. Đồ thị của người dùng này không bao giờ chạm vào người khác.

## Tiếp theo
Mở khóa Phase 14 (tóm tắt) và Phase 15 (hỏi đáp GraphRAG).
