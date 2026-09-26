# Phase 15: hỏi đáp GraphRAG

**Ngày:** 2026-09-26 → 27
**Trạng thái:** đã implement, kiểm với Gemini thật. Reviewer 9/10, criticalCount 0; cổng evidence dừng ở BLOCKED chỉ
vì bộ câu hỏi vàng (30 câu trên 10 cuộc họp thật) chưa có dữ liệu. Commit theo yêu cầu người dùng.

## Đã làm

- Truy hồi đúng sáu bước Luồng 3: nhúng câu hỏi hai kiểu (RETRIEVAL_QUERY cho chunk, SEMANTIC_SIMILARITY cho thực
  thể) → 10 chunk neo (quét chính xác theo user) + 5 thực thể neo (tên trong câu hỏi, rồi vector) → mở rộng một bậc
  qua quan hệ và mention → gom, xếp hạng, cắt ~6.000 token, nhãn S1..Sn kèm tên + ngày họp → trả lời có trích dẫn.
- Chặn trước model: không chunk nào ≥ `QA_MIN_SIMILARITY` (0.6) và câu hỏi không nêu tên thực thể → "không tìm thấy".
- API hỏi trong cuộc họp / xuyên cuộc họp (lọc ngày, thực thể), lịch sử phân trang, xóa; 30 câu/giờ/người dùng.
- Mobile: chat trong cuộc họp (nút "Hỏi AI"), chat toàn cục (dòng Home), "Hỏi về thực thể này"; chip trích dẫn.
- Migration 018. Test: API 387 unit + 130 e2e + 5 schema, mobile 1051.

## Quyết định đáng nhớ

- **Không dùng HNSW cho neo chunk** — ghi chú cũ trong phase ("phải thấy Index Scan") đã lỗi thời: HNSW + lọc user
  trả trang rỗng (đo ở Phase 12). Quét chính xác như `/search`.
- **Câu nối tiếp: ghép câu hỏi liền trước khi tìm**, không gọi model viết lại (người dùng chọn, nhanh hơn ~1,5s).
  Đánh đổi thấy rõ khi kiểm thật: câu không liên quan hỏi ngay sau câu liên quan cũng lọt qua ngưỡng — model vẫn
  trả "không tìm thấy" (4/4), chỉ tốn một lượt gọi.
- **Trích dẫn lưu kèm tên + ngày họp**, tính `available` lúc đọc: đoạn bị cắt lại sau khi sửa transcript thì chip hiện
  "đã thay đổi" thay vì dẫn sai chỗ.
- Đo trước khi chọn model: gemini-2.5-flash trả lời trong 2,2–2,9s với 5,7k token ngữ cảnh — không cần tắt suy nghĩ
  hay đổi sang bản lite.

## Bãi mìn

- **Dò tên bỏ dấu: "cuối tuần" khớp người tên "Tuấn"** → câu ngoài phạm vi lọt qua ngưỡng. Chỉ lộ ra với Gemini thật
  và transcript có tên Tuấn. Sửa: câu có dấu thì so có dấu; gõ không dấu thì so không dấu — **xét từng dòng** của
  chuỗi tìm (lần sửa đầu xét cả chuỗi ghép, nên câu trước có dấu làm câu sau gõ "tuan" không khớp; test bắt được).
- **Bộ lọc ngày: mobile gửi `to=2026-09-30`**, backend hiểu 0h UTC → loại mọi cuộc họp trong ngày đó. Ngày không kèm
  giờ giờ là trọn ngày giờ Việt Nam.
- **Mobile nhân đôi lượt hỏi** khi app quay lại foreground sau >30s (refetch lịch sử + danh sách vừa gửi cục bộ).
  Reviewer bắt được; lọc trùng theo id.
- Lỗi AI (hạn mức / Gemini sập) chỉ `search` tự đổi sang 429/503 — tách `aiErrorToHttp` dùng chung, không thì hỏi đáp
  trả 500.

## Bài học

- Tester lần này báo "đã test 429 QUOTA_EXCEEDED" nhưng không có test nào; hai test khác vá thẳng thuộc tính private
  bằng `any`; một test "cắt ngân sách" chỉ có một chunk trong phạm vi. Đã viết lại / xóa. Đọc từng test vẫn là bắt buộc.

## Việc còn mở

- Bộ câu hỏi vàng 30 câu / 10 cuộc họp thật (chưa bắt đầu) — cùng OQ-02, OQ-03 đều cần dữ liệu người dùng.
- Ngưỡng 0.6 sát mép (câu có đáp án ≥ 0.61, ngoài phạm vi ≤ 0.59) — hiệu chỉnh lại khi có bộ vàng.
- Bộ lọc ngày trên mobile là ô nhập DD/MM/YYYY, chưa có date picker.
- Tiếp theo: Phase 16 (củng cố NFR), 17 (kiểm thử & nghiệm thu). Phase 07/08 vẫn chờ số đo Phase 00.
