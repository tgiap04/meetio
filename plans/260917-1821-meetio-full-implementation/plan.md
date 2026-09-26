---
status: pending
priority: high
created: 2026-09-17
branch: main
work_type: feature
spec_waived: "SDD mode disabled (takumi.sddMode: off)"
blockedBy: []
blocks: []
---

# Meetio — Kế hoạch triển khai

Xây dựng trọn vẹn ứng dụng trợ lý phòng họp AI: ghi âm + nhận diện giọng nói thời gian thực trên
thiết bị, pipeline GraphRAG phía backend, hỏi đáp có trích dẫn nguồn xuyên nhiều cuộc họp.

**Nguồn đặc tả:** [user_stories.md](../../user_stories.md) (41 stories / 6 epics) ·
[Kiến trúc](../../docs/system-architecture.md) · [Mô hình dữ liệu](../../docs/data-model.md) ·
[API](../../docs/api-spec.md) · [Biên bản rà soát stories](../reports/brainstorm-2026-09-17-user-stories-review.md) ·
[Biên bản chốt stack](../reports/brainstorm-2026-09-17-codebase-stack-and-scaffold.md) ·
[Kiểm chứng stack](../reports/researcher-2026-09-17-stack-verification.md) ·
**[Thiết kế giao diện](../../design.png)** (14 màn)

**Hiện trạng:** Bộ khung + vòng đời + quản lý cuộc họp + hạ tầng AI + semantic search + đồ thị thực thể xong — Phase 01–06, 10–13 triển khai đầy đủ, kiểm chứng độc lập.
**Test: 1.357 xanh** (2026-09-26): API 332 unit + 105 e2e + 5 schema (442 tổng) · mobile 915. Phase 04: máy trạng thái toàn phần; pause/resume; queued → BullMQ; cascade xóa; tự đóng 24h idle. Phase 05: WebSocket, JWT, batch 200ms, upsert ON CONFLICT DO NOTHING, ack/COMMIT, rate 120/min/meeting, p95 253ms. Phase 10: danh sách phân trang + lọc bỏ dấu, transcript ảo hóa (200/trang, `FlatList`, edit/search toàn bộ), export Markdown/HTML/PDF share sheet, xóa 10s undo. Phase 11: 5 BullMQ queue + orchestrator, retry 2s/8s/32s × 3 lần, timeout 10min/step, sweep 5min, push Expo khử trùng, GeminiClient usage-tracker (null budget = OQ-04 mở). Phase 12: chunking + embedding batch 20 + exact per-user search 41–44ms (7.5k chunk target), Gemini key pool rotation, tìm kiếm cắt xuyên cuộc họp (Transcript chip, semantic-result-row nhảy tới). Phase 13: trích xuất đồ thị 4 chunk/lần; khớp ba tầng (chính xác → vector → người dùng); gộp/tách; danh sách thực thể với dòng thời gian và đề xuất gộp.
**Phase 00:** Spike STT khung hoàn tất (46 test xanh). Đợi 60 phút audio Việt + chép tay để chạy đo 36 lượt Android/iOS.
**Tiếp theo:** Phase 07/08 chờ Phase 00 đóng (cổng chặn cứng). Phase 12 & 13 chờ user điền GEMINI_API_KEY + chạy gemini:check (pending verification) + bộ dữ liệu vàng 10 cuộc họp (pending OQ-03). Phase 14 (tóm tắt) mở khóa ngay.

### Phạm vi mở rộng — Google Sign-In (NGOÀI spec 260917)

**Lối đăng nhập thứ hai: email/mật khẩu + Google Sign-In.** Không nằm trong spec 260917 nhưng đã xây dựng hoàn tất (plan [260919-2151-google-auth-and-auth-ui](../260919-2151-google-auth-and-auth-ui/plan.md)): 13 phase tự động + 1 manual (đợi QA máy thật); 37 test mới ở mobile, 12 test mới ở API. Quyết định thiết kế:
- Khóa nối là Google `sub` (bất biến), không email (có thể đổi).
- Tự liên kết email khi `email_verified === true` và email tồn tại ở tài khoản mật khẩu.
- `password_hash` nullable; người chỉ-Google xóa tài khoản bằng ID token verified.
- `POST /auth/google` dùng lại chuỗi token mà login mật khẩu phát (không kiểu, TTL mới, hay giới hạn riêng).
**Stack:** yarn 4 workspaces (`nodeLinker: node-modules`) · monorepo `apps/api` + `apps/mobile` +
`packages/shared` · **NestJS 12 (ESM thuần)** + TypeORM + `@nestjs/swagger` · Expo/React Native + axios + TanStack
Query + Zustand · PostgreSQL 15 + pgvector · BullMQ/Redis · Google Gemini.

**Bất biến của stack** (chốt ở [biên bản chốt stack](../reports/brainstorm-2026-09-17-codebase-stack-and-scaffold.md)):
`packages/shared` chỉ chứa kiểu, **0 runtime dependency** · DTO class nằm trong `apps/api` và
`implements` interface của shared · TypeORM `synchronize: false` vĩnh viễn · JSON giữ `snake_case`
đúng api-spec · Zustand không bao giờ giữ dữ liệu server · **bộ lọc ngoại lệ không bao giờ đoán mã
theo miền từ HTTP status** (api-spec §9).

---

## Cổng chặn phải vượt trước

**Phase 00 là cổng chặn cứng.** Spike đo giới hạn nhận diện giọng nói trên thiết bị (OQ-01) quyết
định nhánh kiến trúc cho toàn bộ tầng ghi âm. Kết quả "không đạt" buộc chuyển sang STT đám mây, kéo
theo viết lại Phase 07, sửa cam kết quyền riêng tư (NFR-02) và mô hình chi phí. **Không khởi công
Phase 07 trước khi Phase 00 đóng.** Các phase backend (01–05, 11–16) không phụ thuộc cổng này và
chạy song song được ngay.

---

## Các phase

| # | Phase | Phụ thuộc | Stories | Trạng thái |
|---|-------|-----------|---------|------------|
| 00 | [Spike khả thi STT](phase-00-spike-stt-feasibility.md) — **GATE** | — | US-11 | 🟡 in progress — tooling sẵn sàng, đợi đo máy thật |
| 01 | [Nền tảng monorepo & CI](phase-01-monorepo-foundation.md) | — | — | ✅ **xong** |
| 02 | [Schema cơ sở dữ liệu](phase-02-database-schema.md) | 01 | — | ✅ **xong** (kèm cảnh báo HNSW) |
| 03 | [Xác thực & tài khoản](phase-03-auth-and-account.md) | 02 | US-01→06 | ✅ **xong** |
| 04 | [API vòng đời cuộc họp](phase-04-meeting-lifecycle-api.md) | 03 | US-07,09,16 | ✅ **xong** |
| 05 | [Gateway transcript realtime](phase-05-realtime-transcript-gateway.md) | 04 | US-14 (server) | ✅ **xong** |
| 06 | [Nền tảng mobile](phase-06-mobile-foundation.md) | 03 | US-02,04 | ✅ **xong** (trừ 3 mục hoãn sang 03/07) |
| 07 | [Ghi âm & nhận diện](phase-07-recording-and-stt.md) | **00**, 05, 06 | US-07→13,16 | ⬜ pending |
| 08 | [Hàng đợi ngoại tuyến & phục hồi](phase-08-offline-queue-and-recovery.md) | 07 | US-14,15 | ⬜ pending |
| 09 | [Dịch song song](phase-09-translation-pipeline.md) | 05, 07 | US-17→19 | ⬜ pending |
| 10 | [Quản lý cuộc họp & xuất bản](phase-10-meeting-management-and-export.md) | 04, 06 | US-20,21,23→27 | ✅ **xong** |
| 11 | [Hạ tầng tác vụ AI](phase-11-ai-job-infrastructure.md) | 04 | US-28→30 | ✅ **xong** |
| 12 | [Chunking, embedding & tìm kiếm](phase-12-chunking-embedding-search.md) | 11 | US-22 | ✅ **implemented — pending live Gemini verification** |
| 13 | [Trích xuất đồ thị & khớp thực thể](phase-13-graph-extraction-entity-resolution.md) | 12 | US-38→41 | ✅ **implemented — pending live Gemini verification + OQ-03 gold dataset** |
| 14 | [Tóm tắt & việc cần làm](phase-14-summary-and-action-items.md) | 12, 13 | US-31→34 | ⬜ pending |
| 15 | [Hỏi đáp GraphRAG](phase-15-graphrag-qa.md) | 13 | US-35→37 | ⬜ pending |
| 16 | [Siết yêu cầu phi chức năng](phase-16-nfr-hardening.md) | 11 | NFR-01→13 | ⬜ pending |
| 17 | [Kiểm thử & nghiệm thu](phase-17-testing-and-acceptance.md) | mọi phase | toàn bộ | ⬜ pending |

---

## Thiết kế giao diện

`design.png` ở gốc repo là nguồn hình ảnh cho toàn bộ app — 14 màn, ánh xạ thẳng vào các phase:

| Màn | Phase | Ghi chú |
|-----|-------|---------|
| 1 Splash · 2 Onboarding | 06 | ✅ **dựng xong** → [260918-0033 plan](../260918-0033-mobile-splash-onboarding-permission/plan.md) |
| 3 Quyền truy cập Micro | 07 | ✅ **dựng xong** → [260918-0033 plan](../260918-0033-mobile-splash-onboarding-permission/plan.md); màn đồng ý ghi âm (US-04) đã có ở Phase 06 |
| 4 Trang chủ | 06 · 10 | Danh sách gần đây + nút bắt đầu |
| 5 Cài đặt ghi âm | 07 · 09 | Nguồn âm, ngôn ngữ, bật dịch, chất lượng |
| 6 Ghi âm trực tiếp | 07 · 09 | Sóng âm, transcript theo thời gian + bản dịch (**không có tên người nói** — US-13 đã bỏ) |
| 7 Sau khi kết thúc | 11 | Đúng US-28: trạng thái từng bước pipeline |
| 8 Tổng quan cuộc họp | 10 · 14 | Tab Tóm tắt / Action Items / Transcript / Graph |
| 9 Transcript | 10 | Tìm trong transcript, sửa nội dung (US-24) |
| 10 Knowledge Graph | 13 | Node theo loại thực thể |
| 12 Hỏi đáp AI | 15 | |
| 13 Tìm kiếm | 12 | Tìm ngữ nghĩa (US-22) |
| 14 Cài đặt | 06 | |

**Màu đã lấy mẫu trực tiếp từ ảnh** và chốt trong `apps/mobile/src/theme/colors.ts`:
cam thương hiệu `#F68001` · nền kem ấm `#F9F6F0` · peach `#FEF3E6` · chữ `#212F3C` ·
mint `#DEF7EB`. Nền app là kem ấm, **không phải trắng tinh** — và không có màu đen thuần ở đâu cả.

> **Cảnh báo tương phản.** Chữ trắng trên cam thương hiệu chỉ đạt **2,62:1**, dưới cả ngưỡng AA
> (4,5:1) lẫn ngưỡng 3:1 cho thành phần UI. Thiết kế vẽ như vậy và đó là màu thương hiệu, nên app
> giữ nguyên — nhưng **chữ cam trên nền sáng phải dùng `primaryStrong`** (`#B75F01`, 4,52:1), không
> dùng `primary`. Ràng buộc này có test khoá ở `colors.test.ts`.

Màu cho node đồ thị (Person / Task / Project) **chưa** đưa vào token — để Phase 13 chốt khi màn đó
thực sự được dựng, thay vì đoán trước rồi phải nuôi giá trị không ai render.

---

## Chạy song song

Ba nhánh độc lập sau Phase 04: **mobile** (06 → 07 → 08 → 09), **AI backend** (11 → 12 → 13 → 15, với
14 nhánh ra từ 12+13), và **quản lý cuộc họp** (10). Phase 00 chạy song song với 01–06 nhưng phải
đóng trước 07. Phase 16 bám theo suốt, không chờ phase nào.

## Rủi ro chi phối

| Rủi ro | Phase | Đối sách |
|--------|-------|----------|
| STT trên thiết bị không chịu nổi cuộc họp dài (OQ-01) | 00 → 07 | Cổng chặn cứng; nhánh dự phòng STT đám mây định nghĩa sẵn ở Phase 00 |
| Ngưỡng gộp thực thể sai → đồ thị rác (OQ-03) | 13 | Bộ dữ liệu vàng thủ công; ngưỡng là cấu hình, không hardcode |
| Chi phí LLM vượt kiểm soát (OQ-04) | 09, 16 | Đo token từ Phase 11; dịch tắt mặc định; hạn mức chặn cứng |
| Không biết ai nói câu nào → gán người phụ trách sai (OQ-02) | 14 | US-13 đã bỏ; chỉ suy từ nội dung câu nói, không xác định được thì để trống |

---

## Chuẩn hoàn thành

Toàn bộ 41 story đạt acceptance criteria · 13 NFR đo được và đạt ngưỡng · 4 câu hỏi mở (OQ-01→04)
đều đã có câu trả lời dựa trên số đo thực tế, không còn phỏng đoán.
