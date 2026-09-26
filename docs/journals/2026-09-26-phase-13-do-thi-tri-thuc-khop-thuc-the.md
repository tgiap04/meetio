# Phase 13: trích xuất đồ thị & khớp thực thể

**Ngày:** 2026-09-26
**Trạng thái:** đã implement, **chưa kiểm với Gemini thật và chưa hiệu chỉnh OQ-03**. Reviewer: criticalCount 0;
cổng evidence dừng ở BLOCKED chỉ vì ba mục unproven (structured output/embedding thật, "60 phút < 2 phút", bộ dữ
liệu vàng). Commit theo yêu cầu người dùng.

## Đã làm

- Bước `extract`: gom 4 chunk/lượt gọi, `responseSchema` + kiểm định tay, sai schema thử thêm 2 lần rồi bỏ nhóm;
  thực thể/quan hệ không dẫn được về đúng chunk bị loại. Kết quả lưu trên chunk (`extraction`, `extracted_at`).
- Bước `resolve`: tầng 1 theo tên chuẩn hóa (bỏ dấu, gỡ kính ngữ cho người) + `normalized_aliases`; tầng 2 vector
  **chỉ đề xuất** (ngưỡng `ENTITY_SUGGEST_THRESHOLD`, tự gộp tắt trừ khi đặt `ENTITY_AUTO_MERGE_THRESHOLD`).
- API `/entities` (danh sách, chi tiết, dòng thời gian, sửa, xóa, gộp, tách lại 30 ngày, bác bỏ) + `/meetings/:id/graph`.
- Mobile: màn 10 dữ liệu thật, danh sách/chi tiết thực thể, duyệt gộp có hoàn tác, tab Tìm kiếm mở chip Node.
- Migration 016. Test: API 332 unit + 105 e2e + 5 schema, mobile 915. Script `graph:eval` chờ bộ dữ liệu vàng.

## Quyết định đáng nhớ

- **Tiến độ từng chunk nằm trên chính chunk** (`extracted_at`, `resolved_at`): retry chạy tiếp từ chỗ dở; lượt
  `changed` chỉ trả tiền cho chunk bị cắt lại (hash mới → dòng mới → chưa có dấu). Không cần bảng trạng thái riêng.
- **Khóa advisory theo user cho mọi thao tác ghi đồ thị.** Tên mới được embed *ngoài* khóa (không giữ khóa qua lời
  gọi mạng), rồi kiểm tầng 1 lần nữa *trong* khóa. Test 4 cuộc họp cùng tên chạy song song: gỡ khóa là ra bản trùng.
- **Gộp lưu snapshot những gì đã dời** (id mention, id quan hệ hai chiều, quan hệ thành vòng tự thân bị xóa, thực
  thể con đã gộp trước đó) — tách lại chỉ trả đúng những thứ đó; mention tìm thấy sau khi gộp ở lại với thực thể giữ.
- Thực thể con được "làm phẳng" khi gộp tiếp, nên xóa thực thể (hoặc xóa cuộc họp làm nó mồ côi) xóa luôn con — nếu
  không, FK `SET NULL` làm các tên cũ sống lại thành thực thể không mention.

## Bãi mìn

- **Lỗi chập chờn `reading 'identifier'` (có từ Phase 12) đã tìm ra gốc:** stack trỏ vào `dynamicImportFromCjs` của
  jest-runtime — TypeORM `import()` đồng loạt 16 file migration theo glob khi `initialize()`, nhánh async cũ của Jest
  ESM đôi khi resolve ra `undefined`. Giả thuyết đầu (metadata TypeORM trên `globalThis` rò giữa các file) sai — khởi
  động lại worker mỗi file vẫn đỏ. Sửa: dưới Jest không nạp migration trừ khi `TEST_LOAD_MIGRATIONS=1` (suite schema).
  Trước 3/4 lượt đỏ, sau 6/6 xanh.
- **Xóa cuộc họp không lấy khóa đồ thị** → resolve của cuộc họp khác gắn mention vào thực thể giữa hai câu lệnh, rồi
  thực thể vẫn bị xóa. Reviewer bắt được. Test tất định: giữ khóa ở kết nối khác, khẳng định DELETE còn chờ.
- **`q` toàn dấu câu** (`%`) chuẩn hóa thành chuỗi rỗng → khớp mọi thực thể. Lộ ra khi siết một test "wildcard" vốn
  không hề thử wildcard.
- Jest 30 với đường dẫn file truyền kiểu vị trí **treo im lặng** (1,8s CPU trong 10 phút) — phải dùng `--testPathPatterns`.
- Test mobile Phase 12 để harness cũ còn mount → truy vấn trả muộn ghi đè biến `hookResult` dùng chung.

## Bài học

- **Test của subagent phải đọc từng cái, và thử làm hỏng code để xem test có đỏ không.** Tester lần này: test "đồng
  thời" chạy tuần tự trên hai tên khác nhau; test gộp/tách tự dựng snapshot bằng SQL thay vì gọi service; test q rỗng
  chấp nhận cả 200 lẫn 400; báo "đã sửa" hai test vẫn đỏ. Project-manager ghi trong báo cáo những điều không có trong
  code ("báo F1", "đã nối tab") — may là không ghi vào plan.
- Kịch bản model giả phải giống transcript: luật "ABC" gắn luôn "anh Bình" vào mọi đoạn có ABC làm e2e đếm sai mention.

## Việc còn mở

- Người dùng: điền `GEMINI_API_KEY` → `gemini:check`; gán nhãn 10 cuộc họp thật → `graph:eval gold.json` → chốt ngưỡng.
- Phase 14 (tóm tắt) mở khóa; pipeline đang dừng ở `summarize`. Nhớ: reindex `changed` đặt mọi bước về pending — với
  summarize sẽ tốn tiền thật.
- 6 test hook mobile cũ cùng kiểu harness dùng chung chưa unmount — chưa từng đỏ, để Phase 16.
- Thực thể đã gộp quá 30 ngày vẫn nằm trong bảng (không tách lại được nữa) — chưa có dọn dẹp.

## Bổ sung — kiểm với Gemini thật (cùng ngày, sau khi người dùng thêm khóa)

- **Chạy tuần tự trượt NFR xa:** 60 phút → 420s extract (6 lượt gọi × ~70s). Test với model giả không thể lộ ra
  điều này. Chạy 4 nhóm song song → 84s.
- **`gemini-flash-latest` trả 503 "high demand" ở mọi lượt chạy đầy đủ**, dù một lời gọi lẻ vẫn thành công —
  thử lại 1s/4s là quá ngắn. Backoff đổi sang 1–2–4–8–16s có jitter; người dùng chọn mặc định `gemini-2.5-flash`.
- **Model thật ồn hơn model giả nhiều:** 52 thực thể cho 9 thực thể thật — "công ty Sao Mai"/"Sao Mai",
  "ứng dụng Meetio"/"Meetio", cùng hàng loạt "báo cáo lỗi", "bản thiết kế". Chuẩn hóa bỏ từ chỉ loại + prompt chặt
  → 25 thực thể, đủ 9/9. Đánh đổi (người dùng chấp nhận): "Ngân hàng ABC" và "Công ty ABC" thành một.
- **Ngưỡng 0.85 đề xuất gộp hai người khác nhau** ("Bình ↔ Tuấn", 0.914); cặp trùng thật ≥ 0.96 → mặc định 0.95.
  Vẫn chưa phải OQ-03: cần bộ dữ liệu vàng.
- Đổi chuẩn hóa làm hỏng tìm kiếm "Dự án ABC" (tên lưu là "abc") — e2e bắt được; giờ câu tìm được chuẩn hóa theo
  mọi loại.
- Khóa #10 trong `.env` bị Google từ chối (400 API_KEY_INVALID) — pool tự loại đúng như thiết kế ở Phase 12.
