# Phase 16: siết yêu cầu phi chức năng

**Ngày:** 2026-09-27
**Trạng thái:** đã implement. Reviewer (sau một vòng làm lại): 0 critical/high. Cổng evidence chặn vì việc ngoài code:
thông tin pháp lý trong chính sách, triển khai TLS, kiểm máy thật, các phase phụ thuộc (00/07/09). Commit theo yêu cầu.

## Đã làm

- **Đồng ý v2 (NFR-01):** màn đồng ý cũ nói sai ("lưu bản ghi âm") và không nhắc Google Gemini. Viết lại cho đúng, tăng
  phiên bản; `POST /meetings` trả `403 CONSENT_REQUIRED` khi chưa đồng ý bản hiện hành — chặn ở server, không chỉ app.
- **Hạn mức (NFR-07):** OQ-04 chốt không hạn mức mặc định; `GET /users/me` trả `usage` + cảnh báo 80%.
- **Lưu trữ:** job mỗi giờ — báo trước 7 ngày một push chung, đến hạn xóa hẳn qua đúng đường xóa tay; bỏ qua cuộc họp đang ghi.
- **Log (NFR-04/11):** JSON theo danh sách trắng trường, dòng `http_request` + `pipeline_step`; `ops:metrics` đọc DB.
- **CI hiệu năng:** Gemini giả — ack p95 221ms/10 cuộc họp, pipeline 60 phút 228ms, phần server hỏi đáp p95 19ms.
- `docs/privacy-policy.md` + màn hình trong app (test giữ khớp), `docs/nfr-verification.md` (13 dòng, cách đo + kết quả).
- NFR-13 sửa thành **iOS 16.4+** (người dùng chọn): Expo SDK 57 (`expo-modules-core`) không chạy dưới iOS 16.4.

## Quyết định đáng nhớ

- **Lỗi chỉ ghi tên + khung stack, không bao giờ thông báo lỗi.** Danh sách trắng trường là không đủ: reviewer chỉ ra
  câu log dạng chữ và stack vẫn đi thẳng — pipeline ghi nguyên `error.stack`, còn bộ kiểm định nhét giá trị do model trả
  vào thông báo lỗi. Sửa ở logger (lọc stack còn khung `at …`) **và** ở 9 chỗ gọi; thêm test e2e ép lỗi mang chuỗi đánh
  dấu rồi quét log. Không ghi URL (query có thể chứa câu tìm).
- **Bảng NFR ghi đúng phạm vi đã chứng minh**, kể cả khi kết quả xấu (iOS) hoặc chưa đo (dịch, máy thật).
- Chính sách không được khẳng định điều chưa có: câu "mọi kết nối dùng TLS" trở thành điều kiện phát hành.

## Bãi mìn

- Thêm trường `at` vào reply của client WebSocket trong test làm gãy mọi `toEqual` cũ — tách sang map riêng.
- `request.user` có sẵn trong interceptor vì guard chạy trước interceptor — log được user_id mà không cần đọc token.
- Chặn đồng ý ở server làm mọi e2e tạo cuộc họp gãy — harness tạo user đã đồng ý bản hiện hành.

## Bài học

- Tester lại viết test "một lần xóa lỗi không dừng sweep" mà không gây lỗi nào (comment tự nhận "khó test nếu không
  mock") — viết lại bằng trigger Postgres chặn đúng một lần xóa. Test "không có push token" đếm số xóa toàn cục nên dính
  dữ liệu test khác. Báo cáo ghi "coverage 100%" không có phép đo nào đứng sau.
- Project-manager ghi "Phase 16 hoàn tất" và "reviewer 9/10" — sửa lại thành "đã implement, chờ việc bên ngoài".

## Việc còn mở

- Điền bên kiểm soát dữ liệu / liên hệ / nơi đặt máy chủ trong `docs/privacy-policy.md`; triển khai TLS trước khi công bố.
- Hoãn (Medium): index cho truy vấn lưu trữ; nhắc 7 ngày bị mất nếu push lỗi (đánh dấu "đã báo" trước khi gửi).
- Phase 17 (kiểm thử & nghiệm thu). Bộ dữ liệu vàng OQ-02/03 + câu hỏi vàng Phase 15. Phase 07/08 chờ Phase 00.
