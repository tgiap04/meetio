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
[Kiểm chứng stack](../reports/researcher-2026-09-17-stack-verification.md)

**Hiện trạng:** Bộ khung chạy được đã hoàn tất — Phase 01, 02, 03, 06 xong và kiểm chứng độc lập.
**85 test xanh** (54 API + 31 mobile). Đăng ký/đăng nhập/xoay vòng token chạy thật đầu-cuối;
13 bảng + index HNSW trên Postgres thật; Swagger phục vụ 7 nhóm endpoint.
**Tiếp theo:** Phase 04 (API vòng đời cuộc họp) và Phase 00 (spike STT — cổng chặn Phase 07).
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
| 00 | [Spike khả thi STT](phase-00-spike-stt-feasibility.md) — **GATE** | — | US-11 | ⬜ pending |
| 01 | [Nền tảng monorepo & CI](phase-01-monorepo-foundation.md) | — | — | ✅ **xong** |
| 02 | [Schema cơ sở dữ liệu](phase-02-database-schema.md) | 01 | — | ✅ **xong** (kèm cảnh báo HNSW) |
| 03 | [Xác thực & tài khoản](phase-03-auth-and-account.md) | 02 | US-01→06 | ✅ **xong** |
| 04 | [API vòng đời cuộc họp](phase-04-meeting-lifecycle-api.md) | 03 | US-07,09,16 | ⬜ pending |
| 05 | [Gateway transcript realtime](phase-05-realtime-transcript-gateway.md) | 04 | US-14 (server) | ⬜ pending |
| 06 | [Nền tảng mobile](phase-06-mobile-foundation.md) | 03 | US-02,04 | ✅ **xong** (trừ 3 mục hoãn sang 03/07) |
| 07 | [Ghi âm & nhận diện](phase-07-recording-and-stt.md) | **00**, 05, 06 | US-07→13,16 | ⬜ pending |
| 08 | [Hàng đợi ngoại tuyến & phục hồi](phase-08-offline-queue-and-recovery.md) | 07 | US-14,15 | ⬜ pending |
| 09 | [Dịch song song](phase-09-translation-pipeline.md) | 05, 07 | US-17→19 | ⬜ pending |
| 10 | [Quản lý cuộc họp & xuất bản](phase-10-meeting-management-and-export.md) | 04, 06 | US-20,21,23→27 | ⬜ pending |
| 11 | [Hạ tầng tác vụ AI](phase-11-ai-job-infrastructure.md) | 04 | US-28→30 | ⬜ pending |
| 12 | [Chunking, embedding & tìm kiếm](phase-12-chunking-embedding-search.md) | 11 | US-22 | ⬜ pending |
| 13 | [Trích xuất đồ thị & khớp thực thể](phase-13-graph-extraction-entity-resolution.md) | 12 | US-38→41 | ⬜ pending |
| 14 | [Tóm tắt & việc cần làm](phase-14-summary-and-action-items.md) | 12, 13 | US-31→34 | ⬜ pending |
| 15 | [Hỏi đáp GraphRAG](phase-15-graphrag-qa.md) | 13 | US-35→37 | ⬜ pending |
| 16 | [Siết yêu cầu phi chức năng](phase-16-nfr-hardening.md) | 11 | NFR-01→13 | ⬜ pending |
| 17 | [Kiểm thử & nghiệm thu](phase-17-testing-and-acceptance.md) | mọi phase | toàn bộ | ⬜ pending |

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
| Không có diarization → gán người phụ trách sai (OQ-02) | 07, 14 | Gán nhãn tay ở US-13; để trống thay vì đoán |

---

## Chuẩn hoàn thành

Toàn bộ 41 story đạt acceptance criteria · 13 NFR đo được và đạt ngưỡng · 4 câu hỏi mở (OQ-01→04)
đều đã có câu trả lời dựa trên số đo thực tế, không còn phỏng đoán.
