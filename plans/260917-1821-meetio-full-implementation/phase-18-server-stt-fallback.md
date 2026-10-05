---
phase: 18
title: Nhận diện trên máy chủ khi máy không nhận diện offline được
status: implemented — awaiting real-device verification
priority: high
blockedBy: [07, 08]
---

# Phase 18 — Nhận diện trên máy chủ (Meetio + Gemini) khi máy không offline được

## Context Links
- Quyết định: [clarifications.md](clarifications.md) → Session 2026-10-05 (Phase 18)
- Engine hiện tại: `apps/mobile/src/recording/{stt-engine,expo-stt-engine,recognition-pipeline,recording-session}.ts`
- Gemini: `apps/api/src/ai/gemini.client.ts` (key pool, usage, không log nội dung)
- Đồng ý: `apps/api/src/users/consent.ts` (`CURRENT_CONSENT_VERSION = 2`), `apps/mobile/app/(app)/consent.tsx`, `docs/privacy-policy.md`

## Overview
Máy thật Xiaomi 24129RT7CC (Android 16, ROM Trung Quốc) không có dịch vụ nhận diện on-device →
màn 05 báo "chưa nhận diện offline được", không ghi được. Khi `getOnDeviceLocales()` rỗng, app ghi
âm từng đoạn ~10s, gửi lên `POST /stt/transcribe`, máy chủ nhờ Gemini chép lời, trả chữ; chữ đi vào
đúng đường cũ (đoạn final → hàng đợi SQLite → WS/bulk). Máy có on-device thì giữ nguyên như cũ.

## Key Insights
- `SttEngine` sinh ra để thay engine (comment Phase 07) → engine máy chủ chỉ là một cài đặt khác;
  assembler/hàng đợi/sync worker không đổi.
- `expo-audio` đã có trong app (quyền micro). Xoay đoạn = dừng recorder, lấy file, bắt đầu lại
  ngay — khe ~100–300ms giữa hai đoạn (chấp nhận; lời nói vắt qua khe có thể mất vài âm tiết).
- Gemini nhận audio qua `inlineData` (base64) — `GenAiModels.generateContent` hiện chỉ nhận
  `contents: string`, cần mở rộng kiểu.
- Không có NetInfo → kiểm "có mạng" bằng một request nhẹ tới API trước khi bắt đầu.

## Requirements
Chức năng:
1. Màn 05: on-device rỗng → chế độ máy chủ: liệt kê vi-VN + en-US, hiện thông báo rõ "Máy này
   không nhận diện offline được — âm thanh sẽ được gửi lên máy chủ Meetio để chuyển thành chữ và
   không được lưu lại".
2. Chế độ máy chủ + mất mạng → không cho bắt đầu (nút Bắt đầu báo lỗi kết nối).
3. Đang ghi: mỗi ~10s một đoạn; chữ hiện theo đoạn (trễ ~10–15s); không có chữ từng từ; vẫn có
   mức âm lượng (metering) cho sóng âm ở chất lượng cao.
4. Đoạn gửi lỗi (mất mạng, Gemini lỗi) → bỏ đoạn đó, hiện "— Gián đoạn N giây —" như khoảng chết.
5. Thứ tự chữ đúng thứ tự đoạn (gửi tuần tự).
6. Đồng ý v3: màn Đồng ý + chính sách nói rõ trường hợp máy không nhận diện offline thì âm thanh
   được gửi về máy chủ Meetio và Google Gemini để chép lời, không lưu; người đã đồng ý v2 phải đồng ý lại.

Phi chức năng:
- Máy chủ KHÔNG ghi âm thanh xuống đĩa/DB/log (multer memory storage, ≤ 1 MB, buffer bỏ sau response);
  không log chữ trả về (NFR-04). Khóa Gemini chỉ log "key #N".
- Giới hạn: `audio/*` (m4a/aac), ≤ 1 MB, ≤ 15s; throttle theo người dùng (~12 lần/phút).
- Dùng `usage_records` (operation `stt`) → tính vào hạn mức token như các lời gọi AI khác.
- File đoạn trên máy xóa ngay sau khi gửi (thành công hay lỗi).

## Architecture
```
expo-audio recorder ──10s──▶ file .m4a ──▶ src/api/stt.ts POST /stt/transcribe (multipart)
        │ metering → onVolume                    │
        ▼                                        ▼
 server-stt-engine (SttEngine) ◀── {text} ── SttController → SttService → GeminiClient.transcribeAudio
        │ onResult(text, final=true) / onGap(ms)          (inlineData, prompt "chép nguyên văn, ngôn ngữ X")
        ▼
 recognition-pipeline → segment-assembler → SQLite queue → sync worker (không đổi)
```
Chọn engine: `resolveRecognitionMode(installedLocales)` → `'on_device' | 'server'`; session nhận
engine theo mode khi `start` (đổi `deps.engine` thành `engineFor(mode)`).

## Related Code Files
Tạo:
- `apps/api/src/stt/{stt.module,stt.controller,stt.service}.ts` + spec/e2e
- `packages/shared`: `TranscribeAudioResponse`, hằng giới hạn (kích thước, thời lượng, mime)
- `apps/mobile/src/api/stt.ts`, `apps/mobile/src/recording/server-stt-engine.ts` (+ test, fake recorder)
- `apps/mobile/src/components/recording-setup/server-mode-notice.tsx`
Sửa:
- `apps/api/src/ai/gemini.client.ts` (+ `transcribeAudio`), `app.module.ts`, `users/consent.ts` (v3)
- `apps/mobile/src/recording/{stt-engine,recognition-pipeline,recording-session,recording-runtime}.ts`
- `apps/mobile/src/hooks/use-recording-setup.ts`, `app/(app)/recording-setup.tsx`, `app/(app)/consent.tsx`
- `docs/{api-spec,privacy-policy,system-architecture,nfr-verification}.md`, bản chính sách trong app

## Implementation Steps
1. API: `GeminiClient.transcribeAudio({ audio, mimeType, language, userId, meetingId })` — budget check, runner, usage `stt`.
2. API: `POST /stt/transcribe` — JWT (global), kiểm consent hiện hành (403 CONSENT_REQUIRED), multer memory ≤ 1 MB,
   kiểm mime/ngôn ngữ, throttle; 503 khi chưa cấu hình Gemini. Trả `{ text }` (rỗng nếu im lặng).
3. API: tăng `CURRENT_CONSENT_VERSION` lên 3; cập nhật seed/test liên quan.
4. Mobile: `server-stt-engine` — vòng xoay đoạn 10s, hàng gửi tuần tự, xóa file, metering, lỗi → gap.
5. Mobile: `resolveRecognitionMode`, setup hook trả `mode`; màn 05 hiện notice; kiểm mạng trước khi bắt đầu.
6. Mobile: session/runtime chọn engine theo mode; pipeline bỏ qua `interim` ở chế độ máy chủ.
7. Nội dung đồng ý v3 + chính sách (docs + trong app); docs API/kiến trúc/NFR.

## Todo List
- [x] GeminiClient.transcribeAudio + unit test (inlineData, usage, không log)
- [x] Stt module/controller/service + e2e (auth, consent, 413, mime, throttle, Gemini giả)
- [x] Consent v3 (API + màn Đồng ý + chính sách)
- [x] server-stt-engine + test (xoay đoạn, thứ tự, chữ rỗng bỏ qua, lỗi → gap, xóa file)
- [x] Chọn mode + màn 05 notice + chặn khi mất mạng + test
- [x] Session/runtime nối engine theo mode + test
- [~] Docs (in progress: doc-writer updating docs/api-spec.md, system-architecture.md, nfr-verification.md)
- [ ] Build lại app, thử trên Xiaomi thật

## Kết quả

**Triển khai xong (chưa commit):**
- API `POST /api/stt/transcribe` với inlineData base64, JWT + consent v3, throttle 12/min/user, usage `stt`
- GeminiClient.transcribeAudio (không log nội dung, multer memory ≤1MB)
- Consent v3 (API + màn Đồng ý + chính sách v3)
- Mobile server-stt-engine (xoay đoạn 10s, hàng gửi tuần tự, xóa file, metering, error → gap)
- Mode selection + notice + offline block trên setup screen, mode persisted per local meeting
- Owner guard + consent v3 copy, privacy policy v3 (docs + in-app), expo-audio enableBackgroundRecording
- Reviewer: ✅ approve với fixes; 7 warnings đã sửa (silent server switch, owner guard, stale op, concurrent drain waiters, chunk purge on start, policy overclaim, deep imports)

**Test suite xanh:**
- Mobile: 1440 tests green (221 suites)
- API unit: 406 green; e2e: 163 green
- Typecheck + lint: sạch

**Vấn đề còn mở (chặn device test):**
- Verify on real Xiaomi device (chunks/metering/background/purge)
- Android manifest check for duplicate microphone foreground service (expo-audio + react-native-background-actions)
- Google Gemini data-retention terms for the key tier
- File size: recording-session.ts 216 lines, server-stt-engine.ts 205 lines (trên limit 200)
- Resumed on-device meeting on a phone mất on-device support: không cách để switch mode

## Success Criteria
- Trên Xiaomi thật: màn 05 hiện vi/en + notice; ghi 2 phút → chữ hiện theo đoạn; kết thúc → transcript đủ trên máy chủ.
- Máy có on-device: hành vi không đổi (test cũ xanh).
- Không có file âm thanh nào trên máy chủ sau request (test kiểm không ghi đĩa); log không có chữ.
- Toàn bộ test API + mobile xanh; lint/typecheck sạch.

## Risk Assessment
- Ghi nền Android bằng expo-audio có thể bị dừng khi khóa màn hình → dựa foreground service sẵn có
  (`react-native-background-actions`); kiểm trên máy thật, nếu không đạt thì ghi rõ giới hạn.
- Chất lượng tiếng Việt của Gemini với đoạn 10s, cắt giữa câu → chấp nhận cho bản đầu; đo khi thử thật.
- Chi phí Gemini: 60 phút = 360 lời gọi — đã vào usage_records/hạn mức.
- Khe giữa hai đoạn làm mất vài âm tiết → chấp nhận (quyết định "hiện theo đoạn").

## Security Considerations
- Endpoint yêu cầu JWT + đồng ý v3; throttle theo người dùng; giới hạn kích thước chống lạm dụng.
- Âm thanh chỉ nằm trong RAM của request; không lưu, không log; chữ không log.

## Next Steps
- Phase 00 đo độ chính xác so sánh on-device vs máy chủ khi có dữ liệu thật.
