# Phase 16 · Siết yêu cầu phi chức năng

**Liên kết:** [plan.md](plan.md) · [NFR-01→13](../../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 11 (bám theo suốt các phase sau)

Chi phí, quyền riêng tư, hiệu năng, khả năng quan sát. Phase này không chờ ai — nó chạy song song và
đóng lại ở cuối.

## Nhận định then chốt
- Hạn mức chi phí phải chặn **trước** khi gọi API, không phải báo cáo sau khi tiền đã tiêu.
- Quyền riêng tư không phải một màn hình, nó là một tập ràng buộc rải khắp hệ thống — và phải có
  test cho từng ràng buộc, nếu không nó sẽ trôi.
- Không đo thì không biết có đạt NFR hay không. Chỉ tiêu hiệu năng phải có phép đo tự động, không
  phải cảm nhận khi bấm thử.
- Log có cấu trúc là thứ duy nhất cứu được người trực khi pipeline hỏng lúc 2 giờ sáng.

## Yêu cầu
**Chức năng:** đếm và chặn theo hạn mức token; giới hạn tần suất toàn hệ thống; log có cấu trúc; đo
đếm pipeline; tác vụ áp dụng hạn lưu trữ; trang chính sách quyền riêng tư trong app.
**Phi chức năng:** toàn bộ 13 NFR đo được và đạt ngưỡng đã ghi trong tài liệu.

## Kiến trúc
`QuotaGuard` chạy trước mọi lượt gọi Gemini: cộng dồn `usage_records` trong tháng, vượt hạn mức thì
ném `429 QUOTA_EXCEEDED` **trước khi** phát sinh chi phí.

Log có cấu trúc bằng `pino`, mỗi dòng có `request_id`, `user_id`, `meeting_id`, bước và thời lượng —
nhưng không bao giờ có nội dung transcript hay prompt.

## File liên quan
**Tạo:** `apps/api/src/common/guards/quota.guard.ts` · `common/interceptors/logging.interceptor.ts` ·
`apps/api/src/observability/metrics.service.ts` · `apps/api/src/jobs/retention.job.ts` ·
`apps/mobile/app/(app)/settings/privacy.tsx` · `docs/privacy-policy.md`
**Sửa:** `apps/api/src/ai/gemini.client.ts` (gắn QuotaGuard) · `app.module.ts` (throttler toàn cục)

## Các bước thực hiện
1. `QuotaGuard` kiểm hạn mức trước mọi lượt gọi Gemini; cảnh báo ở mức 80%.
2. Giới hạn tần suất theo đúng bảng ở [api-spec §10](../../docs/api-spec.md#10-giới-hạn-tần-suất).
3. Log có cấu trúc, có bộ lọc chặn trường nhạy cảm lọt vào log.
4. Đo đếm: thời lượng mỗi bước pipeline, độ trễ ack, thời gian trả lời hỏi đáp, token theo thao tác.
5. `retention.job`: xóa cuộc họp quá hạn, thông báo trước 7 ngày.
6. Viết `docs/privacy-policy.md` bám [NĐ 13/2023](../../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr);
   hiển thị trong app ở màn hình cài đặt.
7. Kiểm bộ ký tự và hiển thị tiếng Việt xuyên suốt, gồm cả tìm kiếm không dấu (NFR-12).
8. Kiểm tương thích Android 8.0+ và iOS 15+ (NFR-13).
9. Bộ đo hiệu năng tự động cho từng ngưỡng ở NFR-05 và NFR-06, chạy trong CI.

## Todo
- [ ] QuotaGuard chặn trước khi gọi API + cảnh báo 80%
- [ ] Giới hạn tần suất toàn hệ thống
- [ ] Log có cấu trúc + bộ lọc trường nhạy cảm
- [ ] Đo đếm pipeline và độ trễ
- [ ] Tác vụ áp dụng hạn lưu trữ
- [ ] Chính sách quyền riêng tư + màn hình trong app
- [ ] Kiểm tiếng Việt xuyên suốt
- [ ] Kiểm tương thích phiên bản hệ điều hành
- [ ] Bộ đo hiệu năng tự động trong CI

## Chuẩn hoàn thành
- Vượt hạn mức thì lượt gọi bị chặn **trước** khi phát sinh chi phí, có test chứng minh.
- Quét log production không tìm thấy nội dung transcript, prompt hay token.
- Bộ đo tự động xác nhận đủ NFR-05 và NFR-06.
- Có bảng đối chiếu 13 NFR, mỗi dòng ghi cách đo và kết quả đo.
- Chính sách quyền riêng tư đọc được trong app và nêu đúng dữ liệu đi những đâu.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Log lọt nội dung nhạy cảm | Bộ lọc theo danh sách trắng trường được phép, không phải danh sách đen |
| Hạn mức quá chặt làm người dùng bực | Cảnh báo 80% + nêu rõ còn bao nhiêu trong cài đặt |
| NFR trôi dần theo các phase sau | Bộ đo chạy trong CI, hỏng thì gãy build |

## Bảo mật
Đây là phase quy tụ mọi ràng buộc bảo mật và quyền riêng tư. Bảng đối chiếu 13 NFR là bằng chứng
nghiệm thu, không phải danh sách mong muốn.

## Tiếp theo
Phase 17 nghiệm thu toàn bộ.
