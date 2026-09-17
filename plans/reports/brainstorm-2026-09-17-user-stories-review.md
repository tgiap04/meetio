# Biên bản tư vấn — Rà soát và viết lại User Stories

**Ngày:** 2026-09-17 · **Lăng kính:** CTO (mặc định) · **Mức:** medium

---

## Commission

"Cập nhật lại user stories cho chuẩn, nghiên cứu `user_stories.md` và kiểm tra xem có vấn đề gì không."

Hiện trạng: repo chỉ có một file `user_stories.md`, chưa có code, chưa có docs.

---

## Phát hiện chính

**Sai thể loại tài liệu.** File tên `user_stories.md` nhưng nội dung là technical specification —
không có một user story nào, không actor, không acceptance criteria.

**6 vấn đề nghiêm trọng**

1. Không có actor và không có `user_id` trong schema → mọi endpoint là lỗ hổng IDOR ngay từ thiết kế
2. Mâu thuẫn nguồn sự thật của transcript: F3 (gửi liên tục chống mất dữ liệu) vs Flow 2 (client gửi trọn bộ lúc kết thúc)
3. Nhận diện giọng nói trên thiết bị vốn cho câu lệnh ngắn, chưa chứng minh chịu được cuộc họp 30–60 phút
4. Không có tách người nói (diarization) nhưng lại cần gán trách nhiệm trong action items
5. Đồ thị bị khóa theo từng cuộc họp → mất chính khả năng liên kết chéo là lý do chọn GraphRAG
6. Luồng truy hồi Q&A (F9) hoàn toàn không được đặc tả

**11 vấn đề trung bình** — tên sự kiện WebSocket lệch nhau giữa hai mục; `join_room` cần `meeting_id`
chưa tồn tại; thiếu `status`/`user_id`/`language`; không có job queue và cơ chế thử lại; `full_transcript`
trùng lặp `meeting_chunks`; reindex "nếu cần" không định nghĩa; bản dịch không được lưu; không có
entity resolution; `action_items` JSONB không cấu trúc; thiếu index vector; thiếu phân trang.

**Thiếu hẳn** — chính sách quyền riêng tư và đồng ý ghi âm (NĐ 13/2023); tìm kiếm ngữ nghĩa xuyên
cuộc họp (có sẵn embedding mà không dùng); xuất biên bản; mô hình chi phí; chỉ tiêu hiệu năng;
acceptance criteria.

---

## Quyết định đã chốt

| # | Quyết định | Lý do |
|---|-----------|-------|
| 1 | Bộ 4 tài liệu: `user_stories.md` + `docs/system-architecture.md` + `docs/data-model.md` + `docs/api-spec.md` | Tách tầng sản phẩm khỏi tầng kỹ thuật, mỗi file có nhịp thay đổi riêng |
| 2 | Mô hình người dùng: cá nhân có tài khoản | Bịt lỗ IDOR mà không phải xây workspace/phân quyền |
| 3 | Đồ thị tri thức phạm vi người dùng, xuyên cuộc họp | Giữ đúng giá trị cốt lõi của GraphRAG; đổi lại phải giải bài toán entity resolution |
| 4 | Chạy spike đo nhận diện trên thiết bị trước khi thi công E2 | Rủi ro khả thi lớn nhất; đoán sai thì phải làm lại cả luồng dữ liệu |
| 5 | Không phân chia MVP / phase trong tài liệu stories | Theo yêu cầu của chủ dự án — làm đầy đủ, thứ tự thi công quyết định ở bản kế hoạch |

---

## Đã bàn giao

| File | Nội dung |
|------|----------|
| `user_stories.md` | 3 personas · 6 epics · 41 stories có AC · 13 NFR · 4 câu hỏi còn mở |
| `docs/system-architecture.md` | Vòng đời cuộc họp (state machine) · 3 luồng dữ liệu gồm luồng truy hồi trước đây còn thiếu · chiến lược khớp thực thể · mô hình chi phí |
| `docs/data-model.md` | 13 bảng · index đầy đủ gồm HNSW cho vector · quy tắc xóa cascade · bảng đối chiếu thay đổi so với bản cũ |
| `docs/api-spec.md` | 45 endpoints · 8 sự kiện WebSocket đã thống nhất tên · 10 mã lỗi · giới hạn tần suất |

---

## Rủi ro cần theo dõi khi thi công

1. **OQ-01 — Giới hạn nhận diện trên thiết bị.** Chưa đo. Nếu không đạt, nguyên tắc "audio không
   rời thiết bị" sụp đổ, kéo theo chính sách quyền riêng tư, mô hình chi phí và luồng dữ liệu.
   Phải chạy spike trước E2.
2. **Ngưỡng gộp thực thể (OQ-03).** Thấp thì gộp nhầm, cao thì đồ thị đầy bản trùng. Chỉ hiệu chỉnh
   được trên dữ liệu thật.
3. **Chi phí dịch song song.** Khoản chi lớn nhất trên mỗi cuộc họp. Đã đặt mặc định tắt + gom lô,
   nhưng hạn mức cụ thể còn bỏ ngỏ (OQ-04).
4. **Chất lượng gán người phụ trách (OQ-02).** Không có diarization thì việc gán nhãn tay có thể
   phải chuyển từ tùy chọn thành bắt buộc.

---

## Đo lường thành công của tài liệu

- Mọi story có AC kiểm chứng được bằng thao tác cụ thể — không còn mục nào chỉ là một câu mô tả.
- Mọi sự vật kỹ thuật được nhắc trong stories đều tồn tại ở đúng một chỗ trong ba tài liệu kỹ thuật.
- Không còn mâu thuẫn chéo giữa các tài liệu (tên sự kiện, tên trạng thái, tên bảng).
- Mọi giả định chưa kiểm chứng đều nằm trong danh sách câu hỏi còn mở, không trốn trong phần mô tả.

---

## Việc tiếp theo

Chạy spike OQ-01 trước. Kết quả của nó quyết định E2 giữ nguyên hay phải viết lại — và viết kế
hoạch triển khai trước khi biết kết quả đó là đặt cược, không phải lập kế hoạch.
