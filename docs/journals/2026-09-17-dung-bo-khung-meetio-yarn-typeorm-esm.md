# Dựng bộ khung — Yarn, TypeORM, ESM, và những gì kiểm chứng lộ ra

**Date**: 2026-09-17 20:15
**Severity**: medium
**Component**: Foundation / Core Stack
**Status**: resolved

## Chuyện gì đã xảy ra

Bắt đầu với 4 tài liệu đặc tả nhất quán (41 stories, 13 bảng, 45 endpoints), 18-phase plan toàn `pending`, và **không một dòng code.** Kế hoạch gốc chốt pnpm + Prisma + fetch wrapper. Commission chốt yarn + TypeORM + axios. Xung đột ở 6 file.

Chuyên môn: giải quyết xung đột stack, sửa kế hoạch, dựng bộ khung chạy được từ Phases 01–06, kiểm chứng độc lập từng phần. Kết quả: 4 quyết định chốt, 6 phase file sửa xong, bộ khung xây được, **85 test xanh** (54 API + 31 mobile), **0 dòng committed.**

## Sự thật phũ phàng

Tệ nhất trong lúc này là phát hiện có **ba vấn đề to** chỉ nhìn thấy khi tự chạy lại — không cái nào trong báo cáo agent bị giấu, nhưng cũng không cái nào tự nổi từ test xanh.

Test xanh thôi không phải "xong". `/api/health` báo 401 thay vì 200 — ai triển khai lên production là Docker healthcheck chết ngay. Chuẩn vector search đạt 20ms nhưng **chạy bằng seq scan, không phải index** — quy mô thực (1M chunk) sẽ cọ 2 giây thay vì 80 lần nhanh hơn. Đặc tả ghi thiếu 3 error code chung, buộc toàn bộ lỗi validate đẩy vào `PROCESSING_FAILED` — client đi nhầm nhánh phục hồi.

Cái gắn nhất là **mõi cuối của giả định.** Chính code ghi "Unauthenticated liveness probe" trong docstring, rồi Phase 03 gắn global guard và im lặng bỏ nó vào sau auth. Không test nào bắt được vì test gọi controller trực tiếp, không qua guard. Test xanh, production sập.

## Chi tiết kỹ thuật

**Vector search — lỗ hổng hiệu năng ẩn:**
- Chuẩn "dưới 100ms trên 10k chunk" đạt: **20.7ms** dùng seq scan.
- Index HNSW: **0.245ms** — 80 lần nhanh hơn.
- Planner Postgres không chọn HNSW vì chi phí khởi động cao ở quy mô nhỏ.
- Tuyến tính hóa: 100k chunk ~200ms, 1M ~2 giây.
- Siết chuẩn: `EXPLAIN` **phải** hiện `Index Scan`, không chỉ đo giờ.

**Auth guard rò rỉ:**
- Phase 01–02: `/api/health` → 200
- Phase 03: `@Global() JwtAuthGuard` → **401**
- Unit test: xanh (gọi controller trực tiếp)
- Curl thật: 401
- Sửa: `@Public() + regex(@Private)` trên metadata + test hồi quy đọc metadata
- Xác minh lại: `/api/health` 200, `/api/users/me` 401

**Đặc tả lỗi:**
- `api-spec §9` không có `NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_ERROR`
- Hệ quả: typo'd URL trả `MEETING_NOT_FOUND`, validate 400 trả `PROCESSING_FAILED`
- Sửa: thêm 3 code chung + quy tắc "global filter không bao giờ đoán code từ HTTP status"
- Test tăng: 4 → 7, kèm hồi quy `ScopedRepository` vẫn phát `MEETING_NOT_FOUND` tường minh

**Phiên bản TypeORM — sự thật khác báo cáo:**
- Research + Phase 02 ghi: TypeORM 0.3.27 hỗ trợ `vector`
- npm `latest`: **1.1.1**; `0.3.31` là `legacy`
- `node_modules/typeorm/**/*.d.ts` chứng minh: `vector`, `citext`, PG enum, partial index, GIN trên cột — **tất cả có decorator**, không cần SQL thô
- Phase 02 bảng "không có DSL" **sai ở 4/7 dòng** — sửa lại theo đo được

## Những lần tin nhầm

1. **Tin vào test xanh làm công chứng cuối** → Lỗi. Tự chạy lại, curl thật, đọc code.
2. **Dựa vào con số phiên bản trong báo cáo** → Lỗi. Đối chiếu `.d.ts` thực trong `node_modules`.
3. **Giả định global guard không chạm health probe** → Lỗi. Cần decorator escapehatches tường minh.
4. **Để DTO + interface tự đồng bộ qua `implements`** → Bán-đúng. Bắt được field thiếu/sai kiểu, không bắt field thừa.

Mỗi lần tự chạy lại là một lỗi mà báo cáo agent không lộ.

## Truy nguyên nhân gốc

1. **Unit test chỉ bảo vệ lớp đó.** Guard chạy ở tầng middleware/annotation — không có test chạm nó thì annotation cũng có thể bê bết được.
2. **Research findings có hạn sử dụng.** Phiên bản thay đổi nhanh; mốc ghi trong báo cáo có khả năng lạc hậu lúc thi công.
3. **Spec lỗi chỉ lộ khi thi công.** Hai lần review document — hai lần không phát hiện thiếu error code chung, thiếu cột `notification_settings`. Lỗi này chỉ nổi lên khi dựng controller và thấy "gì tôi trả về đây?"
4. **ESM hệ sinh thái non.** `bullmq` gọi `require('ioredis')` bên trong — trong ESM thuần nó không giải được. Phát hiện ngay Phase 01 vì quyết định di trú sớm ở 8 file, thay vì 500 file lúc Phase 11.

## Bài học rút ra

- **Mốc phiên bản trong báo cáo chỉ là snapshot.** Lúc thi công, ghim phiên bản từ lockfile + xác minh `.d.ts` thực, không tin lại con số viết.
- **Giá trị của benchmark là query plan, không phải giây.** Một chuẩn chỉ đo thời gian có thể đạt bằng brute force. Thêm assertion: `EXPLAIN` phải hiện đường truy vấn mong muốn.
- **Unittest + integration test đều cần.** Xanh unit không đủ. Từ Phase 04 khi endpoint mang id tài nguyên, phải có regresssion test ở tầng HTTP xác minh auth flow end-to-end.
- **Spec không phải xong đến khi thi công xong.** Thiếu error code, thiếu cột — những thứ tự nhiên mà review document không thấy. Lần sau review ngay khi implementation đẩy một cái lên.
- **Di trú stack ở cơ sở (8 file) rẻ hơn ở giữa chừng (500 file).** ESM + NestJS 12 bắt đầu là rủi ro ESM không đạo diễn được; phát hiện ngay là tốt nhất.
- **Delegation thật lòng không che dấu.** Báo cáo agent đều dịch thật — test 38 xanh, Swagger 200, migration round-trip. Nhưng chỉ tự chạy mới thấy `/api/health` 401 và vector plan lạ.
- **Config chết tệ hơn không config.** `JWT_ACCESS_TTL` đặt sẵn ở `.env` nhưng code chặt quy tắc spec — ai sửa `.env` sẽ tin là mình thay đổi vòng đời token và chẳng gì xảy ra. Gỡ nó ra.

## Việc tiếp theo

Bộ khung khóa cứng: Yarn 4, TypeORM 1.1.1, NestJS 12 ESM, 13 entity + migration, auth xoay vòng, FE shell Expo + TanStack + Zustand. **Không ai được đổi stack trên 4 phase này.**

Kỹ thuật giám sát:
- Phase 04 mở endpoint `meetings/:id` → quét IDOR chéo người dùng thực sự có thể làm được.
- Phase 11 phải ghim `ioredis` instance trước, truyền vào `connection` bullmq.
- Cứ khi nào thêm guard, thêm luôn test metadata hồi quy.

Còn treo — nói rõ để không quên:
- `nest start --watch` chưa kiểm dưới ESM (chỉ `start:prod` kiểm).
- Lỗi IDOR chỉ nửa vời — Phase 03 không endpoint nào lấy id tài nguyên người khác.
- Phase 06 ba chuẩn: live login, khởi động lạnh < 2s, glyph Việt trên thiết bị — cố tình treo, có lý do chính đáng.
- **OQ-01 → OQ-04 vẫn mở 100%.** Bộ khung trả lời 0 câu. Phase 00 spike STT chặn Phase 07.

Chưa test gì là chưa biết gì. Không tin test xanh. Tự chạy lại.
