# Đối chiếu 13 yêu cầu phi chức năng (NFR)

Cập nhật: 27/09/2026 · Nguồn yêu cầu: [user_stories.md §4](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)

Mỗi dòng ghi **cách đo** và **kết quả đo thật** — không phải mong muốn. "Tự động" = chạy trong bộ test (CI hỏng thì gãy
build). "Kiểm thật" = script chạy với khóa Gemini thật (`graph:check`, `qa:check`), số liệu trong
[live-2026-09-26-gemini-phase-12-13.md](../plans/reports/live-2026-09-26-gemini-phase-12-13.md). "Production" = đọc
bằng `yarn workspace @meetio/api ops:metrics`.

| NFR | Yêu cầu (tóm tắt) | Cách đo | Kết quả | Trạng thái |
|---|---|---|---|---|
| 01 | Chính sách rõ ràng; đồng ý trước khi gửi dữ liệu sang AI bên thứ ba | `docs/privacy-policy.md` + màn hình trong app (test giữ hai bản khớp nhau); `POST /meetings` trả `403 CONSENT_REQUIRED` khi chưa đồng ý bản hiện hành (e2e `privacy.e2e`) | Đồng ý phiên bản 2 nêu đúng: âm thanh không rời máy, văn bản đi tới máy chủ Meetio và Google Gemini. Người đã đồng ý bản cũ bị hỏi lại | ⚠️ Đạt về kỹ thuật; **cần bổ sung thông tin pháp lý** (bên kiểm soát dữ liệu, liên hệ, nơi đặt máy chủ) trước khi phát hành |
| 02 | Không gửi audio thô khỏi thiết bị (nhận diện trên máy) | Thiết kế: không có đường API nào nhận âm thanh; nhận diện chạy trên máy (Phase 00/07) | Server không có endpoint nhận audio | ⏳ Chờ Phase 00/07 (số đo nhận diện trên máy thật) |
| 03 | TLS toàn tuyến; token trong secure storage | App lưu token bằng secure storage (Phase 06); TLS là cấu hình triển khai | Secure storage: đạt. TLS: chưa triển khai production | ⏳ Kiểm lúc triển khai — cũng là điều kiện công bố chính sách quyền riêng tư (mục 6) |
| 04 | Không log transcript, câu hỏi, prompt ở production | Logger JSON: trường có cấu trúc theo danh sách trắng; lỗi chỉ ghi **tên lỗi + khung stack** (dòng thông báo lỗi — nơi có thể mang dữ liệu — bị bỏ); không nội suy thông báo lỗi vào câu log; không ghi URL (query có thể chứa câu tìm). e2e `privacy.e2e`: (a) đường thành công — pipeline + hỏi đáp; (b) **đường lỗi** — nhà cung cấp trả lỗi lặp lại dữ liệu, model trả giá trị lạ mang dữ liệu; quét toàn bộ log tìm transcript, câu hỏi, câu trả lời, tiêu đề, token, chuỗi đánh dấu | Không tìm thấy chuỗi nào; test đã kiểm đột biến (khôi phục dòng log cũ → test đỏ) | ✅ Tự động · câu log là chữ do code viết, được test quét nhưng không bị lọc cơ học |
| 05 | Hiển thị chữ < 2s; dịch < 3s; hỏi đáp < 5s | Tự động (`perf-budgets.e2e`, Gemini giả): ack đoạn transcript p95 < 500ms trên 10 cuộc họp đồng thời; phần server của hỏi đáp p95 < 1s. Kiểm thật: hỏi đáp cuộc họp 2 giờ | Ack p95 221ms; phần server hỏi đáp p95 19ms; **hỏi đáp thật p95 3,1–3,8s** | ✅ Hiển thị (phần server) + hỏi đáp. ⏳ Dịch: Phase 09 chưa làm. Phần nhận diện trên máy chờ Phase 00 |
| 06 | Pipeline AI cuộc họp 60 phút xong trong 5 phút từ lúc kết thúc | Tự động: cuộc họp 60 phút với Gemini giả, end → ready < 30s. Kiểm thật: từng bước với Gemini thật. Production: `ops:metrics` (end → ready p50/p95) | Gemini giả: 228ms. Thật: extract + resolve 84–114s, tóm tắt 17,6–26s, chunk + embed ~3s → **≈ 2–2,5 phút** | ✅ |
| 07 | Hạn mức chi phí AI theo người dùng, cảnh báo gần ngưỡng; ghi token theo cuộc họp | Chặn trước lượt gọi (`UsageTracker`, test); `GET /users/me` trả `usage` với cảnh báo ≥ 80% (e2e); `usage_records` ghi mỗi lượt gọi có `meeting_id` | Người có hạn mức bị chặn 429 trước khi tốn tiền; cảnh báo 80% hiện trong Cài đặt | ✅ — theo quyết định OQ-04: **không đặt hạn mức mặc định**, chỉ người được đặt riêng mới bị chặn |
| 08 | Dịch song song và trích xuất đồ thị gom lô | Trích xuất gom 4 chunk/lượt gọi (Phase 13); nhúng gom 20 chunk/lượt | Đạt cho trích xuất và nhúng | ✅ Trích xuất · ⏳ Dịch (Phase 09) |
| 09 | Transcript không mất vì lỗi tầng AI/hạ tầng | Ack chỉ sau COMMIT (Phase 05, test tiêm lỗi Postgres); pipeline lỗi không đụng transcript (test) | Đạt | ✅ Tự động · ⏳ phần hàng đợi offline trên máy (Phase 08) |
| 10 | Tác vụ nền idempotent, thử lại không sinh trùng | Test chạy lại từng bước (chunk reconcile theo hash, extract/resolve theo dấu từng chunk, summarize thay việc chưa ai đụng) | Đạt | ✅ Tự động |
| 11 | Log có cấu trúc cho từng bước pipeline: meeting_id, thời lượng, token, kết quả | Dòng `pipeline_step` (meeting_id, bước, lần thử, duration_ms, outcome) + `http_request` (request_id, route, status, duration_ms, user_id), kiểm trong `privacy.e2e`; token theo thao tác trong `usage_records` (`ops:metrics`) | Đạt | ✅ Tự động |
| 12 | Tiếng Việt: tìm kiếm không dấu, hiển thị dấu đúng | Tìm thư viện không dấu (trigram + unaccent, test Phase 10); tìm thực thể không dấu và phân biệt dấu khi câu có dấu (test Phase 13/15); font hệ thống đủ dấu (Phase 10) | Đạt trên test; hiển thị trên máy thật chưa kiểm | ✅ Tự động · ⏳ máy thật |
| 13 | Android 8.0+, iOS 16.4+ (sửa từ iOS 15 ngày 27/09/2026) | Đọc cấu hình build của bộ phụ thuộc | Android: React Native 0.86 yêu cầu API 24 (7.0) → đạt. iOS: `expo-modules-core` (Expo SDK 57) yêu cầu iOS 16.4 → khớp yêu cầu mới | ✅ Cấu hình · ⏳ chạy trên máy thật |

## Việc còn mở theo NFR

- NFR-01: điền thông tin pháp lý trong `docs/privacy-policy.md`.
- NFR-02/05/09: phụ thuộc Phase 00 (số đo nhận diện trên máy thật) → Phase 07/08.
- NFR-05/08: dịch (Phase 09) chưa làm.
- NFR-13: đã chọn nâng yêu cầu lên iOS 16.4+ (người dùng, 27/09/2026); còn kiểm trên máy thật.
