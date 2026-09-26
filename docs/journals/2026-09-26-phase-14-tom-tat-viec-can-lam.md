# Phase 14: tóm tắt & việc cần làm

**Ngày:** 2026-09-26
**Trạng thái:** đã implement, kiểm với Gemini thật. Reviewer 9/10, criticalCount 0; cổng evidence dừng ở BLOCKED chỉ
vì OQ-02 (độ chính xác gán người phụ trách) cần bộ dữ liệu vàng từ cuộc họp thật. Commit theo yêu cầu người dùng.

## Đã làm

- Bước `summarize`: cả cuộc họp mỗi lượt; dưới 80 từ → nói thẳng "không đủ nội dung", không gọi model; một lượt nếu
  vừa `SUMMARY_SINGLE_PASS_TOKENS`, không thì hai tầng (trích dẫn giữ nguyên id chunk qua cả hai tầng). Ý/quyết
  định/việc không dẫn được nhãn nguồn → loại. Viết bằng ngôn ngữ cuộc họp.
- Action item: người phụ trách chỉ khi transcript nêu tên, người đó được nhắc trong chính cuộc họp và khớp đúng một
  thực thể; hạn chót tương đối quy theo ngày họp. Pipeline giờ chạy đủ 5 bước tới `ready`.
- API: tóm tắt, việc theo cuộc họp, danh sách xuyên cuộc họp (việc mở trước), `/actions/filters`, thêm/sửa/xóa.
- Mobile: tab Tóm tắt + Action Items dữ liệu thật, màn "Việc cần làm", dòng "Việc cần làm · N đang mở" trên Home.
- Migration 017. Test: API 362 unit + 123 e2e + 5 schema, mobile 985.

## Quyết định đáng nhớ

- **Chạy lại giữ việc người dùng đã đụng tới** (`is_user_edited`), thay việc AI chưa ai đụng; bỏ bản mới trùng nội
  dung (chuẩn hóa bỏ dấu/hoa thường/dấu câu) với việc được giữ **hoặc đã bị người dùng xóa** (`action_item_dismissals`
  — reviewer chỉ ra việc AI bị xóa sẽ quay lại ở lượt sau).
- **PATCH rỗng là no-op** — trước đó nó âm thầm bật `is_user_edited`, ghim việc AI chưa ai sửa qua mọi lượt chạy lại.
- **Tóm tắt lưu dạng chữ gạch đầu dòng + `summary_citations` có cấu trúc**: export đọc được chữ, mobile đọc cấu trúc.
  Cái giá: export phải dựng lại cấu trúc từ chữ (`summaryBlocks`).
- **`/actions/filters` thay cho tính ở client**: implementer cộng `open_count` theo người → đếm thiếu việc chưa gán;
  chip cuộc họp lấy `GET /meetings?limit=20` → bỏ sót cuộc họp cũ. Một endpoint trả `open_total` chính xác + người +
  cuộc họp có việc mở.

## Bãi mìn

- **Model thật quy "thứ Sáu" thành chính ngày họp** (thứ Bảy 26/9) và "thứ Hai" thành thứ Ba — prompt chỉ có ngày,
  không có thứ. Thêm thứ trong tuần + "ngày gần nhất sau buổi họp" → 6/6 đúng. Model giả không bao giờ lộ ra lỗi này.
- **Export dồn tóm tắt thành một dòng**: HTML gộp khoảng trắng, Markdown coi `\n` là soft break và `•` không phải danh
  sách. Reviewer bắt được; test export cũ chỉ phủ trạng thái "chưa sẵn sàng".
- **Pipeline chạy hết tới `ready` làm hỏng giả định của nhiều e2e cũ**: test chờ `processing` lỡ mất trạng thái (chạy
  quá nhanh); teardown xóa user khi server còn chạy pipeline → `deadlock detected`. Sửa: chờ "rời `queued`", và
  dừng server trước khi xóa dữ liệu.
- **Một lệnh Python thay chuỗi xóa nhầm ba test** — chuỗi mốc xuất hiện ở test trước đó nên đoạn thay trải qua nhiều
  test. Khôi phục từ git, sửa lại bằng chuỗi khớp đúng một lần.
- Test tìm kiếm mobile (Phase 12) chập chờn lần hai: một nhịp `setTimeout(0)` không đủ khi cả bộ test chạy — chờ tới
  khi query xong (có giới hạn).

## Bài học

- Báo cáo của agent vẫn cần đọc lại: project-manager ghi OQ-02 "✅ XONG (sơ bộ PASS)" từ một cuộc họp giả lập; tester
  đặt tên test ngược nghĩa ("việc tay còn lại sau khi xóa cuộc họp") và viết test thứ tự chỉ kiểm "mở trước xong".

## Việc còn mở

- OQ-02 + OQ-03: người dùng gắn nhãn cuộc họp thật (người phụ trách; cặp tên thực thể).
- Medium chấp nhận: PATCH đúng lúc bước summarize thay việc AI chưa ai đụng có thể nhận 404.
- Bước extract 60 phút sát ngân sách (84–114s / 120s).
- Phase 15 (hỏi đáp GraphRAG) mở khóa.
