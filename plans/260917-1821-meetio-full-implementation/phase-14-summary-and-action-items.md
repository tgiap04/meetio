# Phase 14 · Tóm tắt & việc cần làm

**Liên kết:** [plan.md](plan.md) · [US-31→34](../../user_stories.md#e5--pipeline-ai--kết-quả)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ✅ implemented — live Gemini verified; pending OQ-02 gold dataset · **Phụ thuộc:** Phase 12, 13

Tóm tắt điều hành có dẫn nguồn, và danh sách việc cần làm có cấu trúc, sửa được, theo dõi được.

## Nhận định then chốt
- Mỗi ý trong tóm tắt phải dẫn được về chunk nguồn. Tóm tắt không kiểm chứng được thì người dùng
  không dám tin, và không dám tin thì tính năng vô dụng.
- Transcript không có tên người nói (US-13 đã bỏ) → người phụ trách chỉ suy được từ chính nội dung
  câu nói, ví dụ "Bình làm phần thanh toán nhé". **Không xác định được thì để trống**, tuyệt
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
**Tạo:** `apps/api/src/summaries/summarize-step.handler.ts` ·
`apps/api/src/summaries/summary-generator.ts` · `apps/api/src/summaries/summary-schema.ts` · `apps/api/src/summaries/summary-prompt.ts` · `apps/api/src/summaries/assignee-resolver.ts` ·
`apps/api/src/actions/actions.controller.ts` · `apps/api/src/actions/actions.service.ts` · `apps/api/src/actions/action-item-rows.ts` · `apps/api/src/actions/dto/` ·
`apps/mobile/app/(app)/(tabs)/index.tsx` · `app/(app)/meeting-detail.tsx` ·
`src/components/action-item-row.tsx`

**Migration:** `1758000000017` (action_items table + action_item_dismissals tracking)

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
- [x] Prompt tóm tắt có trích dẫn bắt buộc
- [x] Tóm tắt hai tầng cho cuộc họp dài
- [x] Ghi summary + summary_citations
- [x] Trích action item có cấu trúc
- [x] Nối người phụ trách vào entities
- [x] Endpoint action item đầy đủ (GET /actions/filters thay /actions/assignees)
- [x] Màn hình tóm tắt có nhảy tới nguồn
- [x] Màn hình tổng hợp việc cần làm (dòng Home + tab đầy đủ)
- [ ] Đo độ chính xác gán người trên bộ dữ liệu vàng (OQ-02 — chờ người dùng gắn nhãn)

## Chuẩn hoàn thành
- ✅ Mọi ý trong tóm tắt có ít nhất một `chunk_id`, chạm vào nhảy đúng chỗ.
- ✅ Tóm tắt cuộc họp 60 phút xong dưới 60 giây (live Gemini: 17.6s + 26.0s, NFR < 60s **PASS**).
- ✅ Cuộc họp 2 phút không có nội dung thì trả lời thẳng là không đủ để tóm tắt.
- ✅ Không xác định được người phụ trách thì để trống — có test chống việc đoán bừa (4/4 correct or empty, rồi 6/6, **PASS**).
- ✅ Màn hình tổng hợp lọc đúng theo người và theo cuộc họp.
- ✅ Pipeline chạy hết 5 bước tới `ready`.
- ⏳ OQ-02 (độ chính xác gán người): **chưa đo được** — mới có tín hiệu định hướng từ một cuộc họp giả lập (4/4 rồi 6/6 đúng hoặc để trống), không thay được bộ dữ liệu vàng từ cuộc họp thật do người dùng gắn nhãn.

## Rủi ro
| Rủi ro | Đối sách | Trạng thái |
|--------|----------|-----------|
| Tóm tắt bịa nội dung không có trong cuộc họp | Bắt buộc `chunk_ids` cho từng ý; ý không dẫn được nguồn thì loại | ✅ XONG |
| Gán người phụ trách sai vì không biết ai nói | Thà để trống còn hơn gán sai; đo và ghi nhận ở OQ-02 | Cơ chế chống đoán có test; độ chính xác thật chờ bộ dữ liệu vàng |
| Tóm tắt hai tầng làm mất ý quan trọng | So sánh với tóm tắt một tầng trên cuộc họp ngắn để kiểm chứng | ✅ XONG |
| Bước extract 84–114s gần cạn ngân sách 120s (Phase 13) | Tối ưu hóa batch size; track execution time; monitor trên bộ dữ liệu lớn | ⚠️ ACCEPTED RISK |
| PATCH trên action item chưa sửa khi summarize-step thay thế nó → 404 | Concurrent conflict hiếm (PATCH và summarize overlap hiếm); client retry là cách xử lý | ⚠️ ACCEPTED MEDIUM |

## Bảo mật
Không log nội dung prompt tóm tắt. Action item kế thừa quyền sở hữu từ cuộc họp.

## Tiếp theo
Phase 14 đầy đủ; Phase 15 (GraphRAG) mở khóa ngay. Phase 16 (NFR hardening) chạy song song suốt.

## Thiết kế thi công (2026-09-26)
Quyết định người dùng: [clarifications.md › Phase 14](clarifications.md). Hợp đồng: `packages/shared/src/actions/actions.types.ts`
+ `MeetingActionItem` / `MeetingDetailResponse` (thêm trường, không bỏ trường nào).

**Migration 1758000000017** — `meetings.summary_insufficient boolean`; `action_items.table` + `is_user_edited boolean` + `is_manual boolean` + `is_dismissed boolean` (PATCH nào cũng bật `is_user_edited`); `action_item_dismissals` (user_id, action_item_id, dismissed_at) giữ track việc người dùng xóa khỏi danh sách để không re-add.

**Bước `summarize`** (`graph/`-style: `apps/api/src/summaries/summarize-step.handler.ts`): luôn tóm tắt cả cuộc họp
(kể cả lượt `changed`). Dưới ~80 từ → không gọi model, ghi `summary_insufficient` + câu nói thẳng. Chunk gắn nhãn
C1..Cn; một lượt gọi nếu ước lượng ≤ `SUMMARY_SINGLE_PASS_TOKENS` (mặc định 60k), vượt thì hai tầng: tóm tắt từng
nhóm chunk (giữ trích dẫn id chunk thật) rồi tổng hợp. `responseSchema` bắt buộc; ý/quyết định không dẫn được nhãn hợp
lệ → loại; model tự báo không đủ nội dung → insufficient. Ngôn ngữ = `source_language` của cuộc họp. Ngày họp đưa vào
prompt để quy hạn chót tương đối ra YYYY-MM-DD; sai định dạng → NULL.

**Người phụ trách:** chỉ khi model trả tên *được nói rõ trong câu*; khớp tầng 1 (`normalizeEntityName` person) với
thực thể người được nhắc trong chính cuộc họp, đúng một kết quả mới gán, không thì NULL — có test chống đoán.

**Chạy lại:** xóa action item AI (`is_manual=false`, `is_user_edited=false`); giữ phần còn lại; bỏ bản mới trùng nội
dung (chuẩn hóa) với việc được giữ. Một transaction cùng lúc ghi summary.

**API** (`actions` module): `GET /meetings/:id/summary`, `GET /meetings/:id/actions`, `GET /actions` (lọc status /
người / cuộc họp, việc mở trước, xong xuống cuối), `GET /actions/filters` (trả open_total, assignees danh sách, meetings có item mở), `POST /meetings/:id/actions`,
`PATCH /actions/:id` (empty body = no-op, không 404), `DELETE /actions/:id`. Mọi truy vấn lọc `user_id`.

**Mobile**: Summary tab ở màn meeting-detail (nội dung ý + quyết định, chạm → transcript `?seq=`, trạng thái không đủ nội dung / đang cập nhật); Action Items tab ở meeting-detail (tick lưu thật, sửa, thêm tay, xóa); màn "Việc cần làm" tổng hợp từ home-screen (lọc người/cuộc họp, việc xong cuối danh sách, chạm → cuộc họp) với lối vào dòng "Việc cần làm · N đang mở" trên Home.

**Export:** Markdown/HTML render bullet `summary.summary_points` thành danh sách thực sự, không dạng JSONB.

**Pipeline** sau Phase 14 chạy hết 5 bước tới `ready`. OQ-02 (độ chính xác gán người) đo sơ bộ trên cuộc họp giả lập trong `graph:check` — chuyển sang bộ dữ liệu vàng khi người dùng gắn nhãn.
