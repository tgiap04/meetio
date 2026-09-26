# Phase 16 · Siết yêu cầu phi chức năng

**Liên kết:** [plan.md](plan.md) · [NFR-01→13](../../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ✅ **implemented — pending external items (legal info, TLS deploy)** · **Phụ thuộc:** Phase 11 (bám theo suốt các phase sau)

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
8. Kiểm tương thích Android 8.0+ và iOS 16.4+ (NFR-13, sửa từ iOS 15 ngày 27/09/2026).
9. Bộ đo hiệu năng tự động cho từng ngưỡng ở NFR-05 và NFR-06, chạy trong CI.

## Todo
- [x] QuotaGuard chặn trước khi gọi API + cảnh báo 80% — UsageTracker.assertWithinBudget (Phase 11), tested
- [x] Giới hạn tần suất toàn hệ thống — throttler toàn cục api-spec §10
- [x] Log có cấu trúc + bộ lọc trường nhạy cảm — json-logger + log-error allowlist, e2e verified
- [x] Đo đếm pipeline và độ trễ — perf-budgets.e2e.spec.ts CI, ops-metrics.mjs script
- [x] Tác vụ áp dụng hạn lưu trữ — retention.job.ts chạy hằng giờ, e2e tested
- [x] Chính sách quyền riêng tư + màn hình trong app — privacy-policy.md + screen, legal info pending
- [x] Kiểm tiếng Việt xuyên suốt — test coverage; thiết bị thật chưa kiểm
- [x] Kiểm tương thích phiên bản hệ điều hành — Android pass (API 24+); iOS: Expo SDK 57 cần 16.4 → NFR-13 sửa thành iOS 16.4+ (quyết định người dùng); chưa chạy máy thật
- [x] Bộ đo hiệu năng tự động trong CI — perf-budgets.e2e.spec.ts p95 thresholds

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

## Thiết kế thi công (2026-09-27)
Quyết định người dùng: [clarifications.md › Phase 16](clarifications.md).

**Đã có từ trước (chỉ kiểm lại):** chặn hạn mức trước lượt gọi (`UsageTracker.assertWithinBudget`, Phase 11); bảng giới
hạn tần suất api-spec §10 (auth, search, qa, WS, mặc định); tìm kiếm không dấu (NFR-12); ack sau COMMIT (NFR-09).

## Sự lệch lạc khỏi thiết kế & bổ sung thực thi

**File layout:** Quota check không lấy riêng file mới; `UsageTracker` từ Phase 11 dùng, đã có sẵn ở `apps/api/src/ai/gemini.client.ts`. Logger ở `common/logging/` (json-logger.ts + log-error.ts + request-logging.interceptor.ts), không phải `guards/quota.guard.ts`.

**Consent enforcement:** Server-side ở `POST /meetings` trả 403 CONSENT_REQUIRED khi chưa đồng ý bản hiện hành (CURRENT_CONSENT_VERSION = 2); tất cả route khác không kiểm consent vì chỉ tạo recording mới mới cần gated.

**Log discipline:** json-logger allowlist fields (:10-13); log-error.ts trích errorCode() (name only) + stackFrames() (stack lines only, không message); e2e privacy.e2e.spec.ts:241-267 chạy FakeGeminiServer với marker-bearing error + malformed value, chứng minh không nằm log.

**Retention:** Chạy hằng ngày (hourly), DUE = COALESCE(ended_at, created_at) + retention_days; thông báo trong [now, now+7d], xóa ≤ now; cả hai filter NOT IN ('recording','paused'); upsert failure báo log, sweep tiếp.

**Đo CI:** perf-budgets.e2e.spec.ts với fake Gemini: segment-ack p95 < 500ms/200 segments qua 10 cuộc họp; 60-min pipeline < 30s end-to-ready; QA server-side p95 < 1000ms.

**Để sau (trừ scope Phase 16):** Không có index cho retention query (COALESCE+NOT IN+ORDER BY); notice được claim trước push (fail push = mất reminder).

### Quyết định mở OQ-04 được chốt
- Q: OQ-04 — hạn mức token AI mặc định mỗi người dùng mỗi tháng?
- A: **Không giới hạn mặc định** — chỉ chặn người được đặt hạn mức riêng (monthly_token_budget); cảnh báo 80% cho người có hạn mức.
- Cách xác nhận: `GET /users/me` thêm `usage {used, budget|null, percent|null, warning}`; cảnh báo ≥ 80%.

**Migration 019** — `users.consent_version int` (NULL = chưa đồng ý bản hiện hành); `meetings.retention_notified_at`;
`qa_messages.latency_ms` (đo NFR-05 hỏi đáp ở production).

**Đồng ý (NFR-01):** `CURRENT_CONSENT_VERSION = 2`; `POST /users/me/consent` ghi phiên bản; `PublicUser.consent_required`;
`POST /meetings` trả `403 CONSENT_REQUIRED` khi chưa đồng ý bản hiện hành (chặn ngay tại server, không chỉ ở app).

**Hạn mức (NFR-07):** `GET /users/me` thêm `usage {used, budget|null, percent|null, warning}` — warning khi ≥ 80%.

**Lưu trữ:** job bảo trì hằng ngày `apply-retention`: cuộc họp có `COALESCE(ended_at, created_at) + retention_days`
trong 7 ngày tới và chưa báo → một push chung cho mỗi người dùng (không nêu tiêu đề); quá hạn → `MeetingDeletionService`.

**Log có cấu trúc (NFR-04/11):** logger JSON theo danh sách trắng trường (`LOG_FORMAT=json`, mặc định ở production);
interceptor ghi `request_id`, route, status, duration, user_id; engine ghi từng bước pipeline kèm meeting_id, bước,
thời lượng, kết quả. Test e2e quét log server sau khi chạy pipeline + hỏi đáp: không được chứa transcript, câu hỏi,
câu trả lời hay token.

**Đo đếm:** `yarn ops:metrics` đọc DB: p50/p95 thời lượng từng bước (processing_jobs), token theo thao tác
(usage_records), độ trễ hỏi đáp (qa_messages.latency_ms). **CI:** test ngân sách hiệu năng với Gemini giả (ack, phần
server của hỏi đáp và pipeline).

**Quyền riêng tư:** `docs/privacy-policy.md` (NĐ 13/2023) + màn hình trong app (mục "Chính sách bảo mật" ở Cài đặt),
test giữ nội dung app khớp tài liệu. **Bảng 13 NFR:** `docs/nfr-verification.md` — mỗi dòng cách đo + kết quả.

## Số đo thực tế (2026-09-27)

**Test suite:** api unit 402, e2e 145, schema 5 (tổng 552) · mobile 1086. Typechecks + eslint --max-warnings=0 clean.

**Hiệu năng (CI, fake Gemini):** segment-ack p95 221ms/10 concurrent meetings; 60-min pipeline p95 228ms end-to-ready; Q&A server-side p95 19ms.

**Quyền riêng tư:** privacy.e2e.spec.ts:241-267 quét log sau pipeline + QA với FakeGeminiServer (marker-bearing error + malformed model value); không tìm thấy transcript, câu hỏi, câu trả lời, token.

**NFR-13 (tương thích):** Android ✓ (minSdk 24); iOS: expo-modules-core (Expo SDK 57) yêu cầu iOS 16.4 → người dùng chọn nâng yêu cầu lên iOS 16.4+ (27/09/2026), không hạ SDK.

**Bảng 13 NFR:** docs/nfr-verification.md cập nhật với số đo thực tế + các hạng mục chưa chứng minh (legal info, TLS).
