# Phase 00 spike STT + Phase 04–05 vòng đời cuộc họp & gateway realtime

**Ngày:** 2026-09-25 · **Commit:** `ee93523`, `e6b2764` (Phase 00) · `d32e1df`..`d1a4e9f` (Phase 04–05)
**Trạng thái:** Phase 04–05 xong. Phase 00 có công cụ, **chưa có số đo** — Phase 07 vẫn bị chặn.

## Đã làm

- **Phase 00:** app Expo đo nhận diện (`spikes/stt-feasibility/`, ngoài workspace yarn), vòng tự bật lại
  100ms, log JSONL, CLI tính WER / chữ mất mỗi lần restart / heartbeat hụt, `REPORT.md` khung. 47 test.
- **Phase 04:** máy trạng thái một chỗ, create/pause/resume/end/list/detail/patch/delete, tự đóng cuộc họp
  bỏ quên 24h, job BullMQ `meeting-processing`. Migration 012 (cột thiếu + theo dõi tạm dừng), 013 (index).
- **Phase 05:** `/meeting-room` socket.io, gom lô 200ms, ack sau COMMIT, endpoint `bulk`, giới hạn
  120 đoạn/phút/cuộc họp. Test tải 20 cuộc họp × 2 đoạn/s × 10 phút: 24000/24000, p95 253ms.
- API 133 → 278 test (230 unit/integration + 48 e2e); mobile 572.

## Quyết định đáng nhớ

- **Bỏ `@react-native-voice/voice`** (bản cuối 2022, không có New Architecture — RN 0.86 bắt buộc) →
  `expo-speech-recognition`.
- **Lượt đo on-device phải chạy offline.** Đọc source thư viện: Android < 13 chỉ gửi `EXTRA_PREFER_OFFLINE`
  (gợi ý); iOS lặng lẽ bỏ `requiresOnDeviceRecognition` khi không hỗ trợ, `supportsOnDeviceRecognition()`
  kiểm locale mặc định chứ không phải vi-VN, và `installedLocales` trên iOS chỉ là bản sao `locales`. Không
  API nào chứng minh được NFR-02 — chế độ máy bay là bằng chứng duy nhất, app chặn lượt on-device khi còn mạng.
- **Restart 100ms, không phải 500ms:** AC US-11 đòi bật lại *trong vòng* 500ms, chờ đủ 500ms là trượt chắc.
- **`end` nhận `{last_seq}`** — server không thể tự biết client còn giữ bao nhiêu đoạn. Thiếu → 409 kèm
  `missing_seqs`. Quét seq chạy *trước* khi khóa: tập seq thiếu chỉ co lại khi cuộc họp còn sống.
- **Một khóa, lấy đầu tiên:** mọi writer (segment, end, delete, sweep) lấy `FOR NO KEY UPDATE` trên dòng
  meeting trước tiên — không nâng khóa, không deadlock. `FOR UPDATE` sẽ chặn FK check của insert segment.
- **Con trỏ phân trang giữ text micro giây của Postgres.** `Date` của JS cắt về mili giây → hai dòng cùng
  mili giây so sai ở biên trang và một dòng biến mất. Test ép trùng `created_at` để giữ điều này.
- **Enqueue sau COMMIT** + sweep 15 phút đẩy lại cuộc họp `queued` bị lạc job (Redis không nằm trong transaction).

## Bãi mìn gặp phải

- **Jest ESM không nạp nổi `AppModule`:** `Cannot require() ES Module .../@nestjs/common/index.js in a cycle`
  (từ `@nestjs/throttler`). `tsx` không thay được — esbuild không sinh decorator metadata cho DI của Nest.
  → e2e chạy `node dist/main.js` làm process con, nói chuyện qua HTTP/socket.io như client thật.
- **Guard JWT toàn cục chạy cả trên handler WebSocket** → mọi sự kiện 500:
  `TypeError: Cannot read properties of undefined (reading 'authorization')`. Guard giờ chỉ áp cho HTTP;
  WS xác thực một lần ở handshake.
- **`ApiExceptionFilter` đẩy nguyên text lỗi DB ra client ở mọi endpoint** — một spec cũ còn khẳng định
  `message: 'boom'`. Giờ trả câu chung, chi tiết chỉ nằm trong log.
- **Test chập chờn:** `schema.integration.spec.ts` revert migration trong khi e2e chạy song song →
  `column "paused_at" of relation "meetings" does not exist`. Lần chạy đầu xanh là nhờ may.
  → `test` = `test:unit && test:e2e --runInBand`.
- **Giả định sai của chính mình:** "giữ bản gửi đầu tiên" của một seq trùng không xác định được khi các bản
  cùng đang bay trên một socket (Nest xử lý sự kiện song song). Bảo đảm thật: đúng một dòng, và một khi đã có
  thì không bao giờ bị ghi đè.

## Bài học

- **Báo cáo của subagent phải kiểm lại bằng lệnh chạy thật, kể cả khi nó rất tự tin.** Trong phiên này:
  reviewer Phase 00 vòng đầu báo "test đỏ" vì đọc lúc tester đang viết dở (thực tế 46/46); project-manager tự
  điền "376 test mobile / 37 suites" (đo thật: 572 / 106); tester có một test chấp nhận cả hai kết quả (vô
  nghĩa) và một test "end khi bộ gom lô còn giữ đoạn" thực ra đi qua `bulk`, không đụng bộ gom lô — thay bằng
  e2e cửa sổ 5s tất định. Chính bản journal nháp đầu tiên cũng chép lại các "lỗi critical" đã sửa từ trước khi
  commit.
- **Chứng minh "ack sau khi bền vững" bằng tiêm lỗi thật** (trigger Postgres ném exception), không bằng mock.
- **Test xóa cascade lấy danh sách bảng từ `pg_constraint`,** không liệt kê tay — bảng thêm sau tự được kiểm.

## Việc còn mở

- Phase 00: chuẩn bị file họp tiếng Việt 60 phút + bản chép tay, **chốt ngưỡng ở `REPORT.md` §1 trước lượt
  đo đầu**, đo 36 lượt trên máy thật (Android 13+, iOS). App chỉ kiểm mạng lúc bắt đầu — người đo phải giữ
  chế độ máy bay suốt lượt.
- Phase 11: gắn processor cho `meeting-processing`; `jobId = meeting_id` chặn trùng, nên đường chạy lại
  (retry / sửa transcript) cần jobId khác. Nối `MeetingRoomNotifier` cho `processing_status` / `meeting_ready`.
- Hoãn: index `updated_at` cho sweep cuộc họp `queued` bị lạc (số lượng `queued` hiện rất nhỏ).
