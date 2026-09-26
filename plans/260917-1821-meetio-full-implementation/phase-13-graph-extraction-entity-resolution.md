# Phase 13 · Trích xuất đồ thị & khớp thực thể

**Liên kết:** [plan.md](plan.md) · [US-38→41](../../user_stories.md#e6--đồ-thị-tri-thức--hỏi-đáp) ·
[Khớp thực thể](../../docs/system-architecture.md#5-khớp-và-gộp-thực-thể)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ✅ implemented — pending live Gemini verification + OQ-03 gold dataset · **Phụ thuộc:** Phase 12

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
- [x] Prompt trích xuất + kiểm định schema
- [x] Xử lý sai schema có thử lại và bỏ qua
- [x] Chuẩn hóa tên tiếng Việt
- [x] Khớp ba tầng
- [x] Ghi entity_mentions và relations
- [x] Endpoint đồ thị đầy đủ
- [x] Bảng chặn đề xuất đã bác bỏ
- [x] Màn hình thực thể + dòng thời gian + duyệt gộp
- [ ] Bộ dữ liệu vàng và hiệu chỉnh ngưỡng (đóng OQ-03) — script sẵn, chờ dữ liệu

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

## Thiết kế thi công (2026-09-26)
Quyết định người dùng: [clarifications.md › Phase 13](clarifications.md). Hợp đồng API: `packages/shared/src/graph/graph.types.ts`.

**Migration 016** — `meeting_chunks`: `extraction jsonb`, `extracted_at`, `resolved_at` (trạng thái từng chunk → retry tiếp
từ chỗ dở, lượt `changed` chỉ xử lý chunk mới). `entities.normalized_aliases text[]` (GIN) cho tầng 1.
Bảng `entity_merge_suggestions (user_id, entity_a_id < entity_b_id, score)` unique theo cặp; `entity_merges`
(keep_id, merged_id, snapshot jsonb: id mention/relation đã dời, alias cũ của keep; `undone_at`) cho tách lại 30 ngày.

**Bước `extract`** — chunk chưa `extracted_at`, gom 4 chunk/lượt, nhãn `C1..C4`; JSON schema bắt buộc
(`responseSchema`) + kiểm định tay. Sai schema → thử thêm 2 lần → bỏ nhóm (extracted_at set, extraction NULL, log
meeting_id + chunk id, không log nội dung). Thực thể/quan hệ trích dẫn nhãn không có hoặc quan hệ có đầu mút không
nằm trong thực thể của cùng chunk → loại.

**Bước `resolve`** — mỗi chunk một transaction, `pg_advisory_xact_lock` theo user (hai cuộc họp song song không tạo
bản trùng). Tầng 1: `(user_id, type, normalized_name | normalized_aliases)`, bỏ qua thực thể đã gộp. Không khớp →
embed "tên — mô tả" (SEMANTIC_SIMILARITY) rồi tạo mới; láng giềng cùng loại ≥ `ENTITY_SUGGEST_THRESHOLD` (0.85) và
chưa bị bác bỏ → đề xuất gộp. `ENTITY_AUTO_MERGE_THRESHOLD` mặc định tắt. Thực thể `is_user_edited` không bị sửa
tên/loại/mô tả. Cuối bước: xóa thực thể mồ côi (không mention, chưa sửa tay, chưa gộp).

**API** (`graph` module, lọc `user_id`, ẩn `merged_into_id`): danh sách/chi tiết/timeline/sửa/xóa, đề xuất + bác bỏ,
gộp + tách lại (30 ngày; 409 khi hết hạn/đã tách), `GET /meetings/:id/graph` cho màn 10.

**Mobile** (implementer): màn 10 dữ liệu thật (chip Tất cả/Người/Dự án/Chủ đề/Khác), danh sách thực thể, chi tiết +
quan hệ + timeline (chạm → transcript `?seq=`), sửa/xóa, duyệt đề xuất gộp + hoàn tác; tab Tìm kiếm mở chip Node và
nhóm Người. Nút "hỏi trong phạm vi thực thể" (US-39) ẩn tới Phase 15.

**Dừng pipeline** ở `summarize` (chưa có handler, Phase 14). **Chưa làm được:** bộ dữ liệu vàng 10 cuộc họp thật
(OQ-03) và số đo "60 phút < 2 phút" cần khóa Gemini — có script `graph:eval` chờ dữ liệu.

## Lệch thiết kế (Deviations)

**Vị trí handler:** handlers (`extract-step.handler.ts`, `resolve-step.handler.ts`) sống ở `apps/api/src/graph/` chứ không phải `jobs/processors/`, tuân theo mô hình Phase 12.

**Mobile routes:** màn thực thể nằm ở `app/(app)/entities.tsx`, `entity-detail.tsx`, `merge-suggestions.tsx` (đơn giản), không phải `entities/index.tsx` + `[id].tsx`.

**Tầng vector:** chỉ gợi ý gộp, không tự gộp trừ khi `ENTITY_AUTO_MERGE_THRESHOLD` được set (quyết định người dùng, OQ-03).

**Gộp 4 chunk/lần:** extraction gom 4 chunk mỗi request tới Gemini (thay vì mỗi lần 1 chunk).

**US-39 ẩn:** affordance "hỏi trong phạm vi thực thể" giấu cho tới Phase 15.

**Sửa lỗi:** delete cuộc họp bây giờ khóa per-user graph lock; jest không load migrations except ở schema suite (TEST_LOAD_MIGRATIONS=1), fix lỗi intermittent "reading 'identifier'".

## Mục mở

**Gemini verification:** User điền `GEMINI_API_KEY` và chạy `gemini:check` để xác nhận khóa hoạt động và `responseSchema` đúng cách.

**OQ-03 gold dataset:** User label 10 cuộc họp thật, sau đó chạy `yarn workspace @meetio/api graph:eval gold.json` để đo độ chính xác khớp và tối ưu `ENTITY_SUGGEST_THRESHOLD` + `ENTITY_AUTO_MERGE_THRESHOLD`.

**Mobile hook tests:** 6 test hook cũ dùng mô hình `mounted-harness` có thể lên lỗi không ổn định — để dán lại ở Phase 16.

## Bản ghi kiểm chứng

- **Code review:** typecheck ✅, eslint ✅, criticalities: 0
- **Tests:** 332 API unit + 105 e2e + 5 schema + 915 mobile = 1.357 xanh
- **Live verification:** blocked chờ `GEMINI_API_KEY` + bộ dữ liệu OQ-03
- **Performance:** extraction script sẵn, "60 phút < 2 phút" chưa đo
- **ResponseSchema:** Gemini sẽ kiểm tra khi chạy thật
