---
phase: 21
title: Dịch trên điện thoại bằng ML Kit + sửa giao diện
status: implemented — awaiting device verification
priority: high
blockedBy: [09]
---

# Phase 21 — ML Kit thay Gemini cho dịch; chờ dịch xong mới kết thúc; sửa UI

**Quyết định:** clarifications.md → Session 2026-10-05 (dịch bằng ML Kit + sửa giao diện).

## Kiến trúc dịch mới
```
câu chốt (assembler) ─▶ local Expo module `mlkit-translate` (Kotlin/Swift, ML Kit on-device)
   └─▶ store hiển thị ngay dưới câu ─▶ SQLite `pending_translations` (bền) ─▶ sync worker
        PUT /meetings/:id/segments/:seq/translation {translated_text, translated_to} (idempotent, owner)
```
- Gói ngôn ngữ tải khi bật "Dịch sang" (tiến trình, cảnh báo 4G); thiếu gói → chưa cho bắt đầu ghi có dịch.
- Kết thúc: chờ mọi câu dịch xong/lỗi (không timeout) → đồng bộ hết bản dịch → mới gửi `end`. Lỗi → đánh dấu, dịch lại ở màn transcript (trên máy).
- Sửa câu ở transcript → server xóa bản dịch cũ, điện thoại dịch lại và PUT.
- Gỡ bộ dịch Gemini (batcher/retry endpoint/sự kiện segment_translated) ở máy chủ. Chính sách: dịch chạy trên điện thoại, văn bản không gửi Google để dịch (v4 chưa phát hành — sửa trong v4).

## Sửa giao diện
- Live transcript: đệm dưới + safe-area để chữ không sát mép.
- Hỏi AI (ask + meeting-chat): Android bàn phím che ô nhập (edge-to-edge) → KeyboardAvoidingView hoạt động cả Android; empty state không bị lật (render ngoài inverted list); chỉ báo "đang trả lời" nằm dưới câu hỏi đang chờ.

## Todo
- [x] Expo module mlkit-translate (Kotlin + Swift)
- [x] Android ML Kit 17.0.3 build xác nhận
- [x] Tải gói ngôn ngữ (tiến trình, cảnh báo dữ liệu di động)
- [x] Dịch từng câu với watchdog 30s
- [x] SQLite pending_translations (bền)
- [x] Sync PUT /meetings/:id/segments/:seq/translation (idempotent, owner, retry 404 × 10)
- [x] Kết thúc chờ dịch xong không giới hạn thời gian
- [x] Gỡ bộ dịch Gemini phía máy chủ (translation module, retry endpoint, events)
- [x] Transcript re-translate on device
- [x] Live transcript safe-area + bottom padding
- [x] Hỏi AI bàn phím container (Android ≥35 manual, <35 resize; iOS frame-change)
- [x] Empty state không lộn ngược
- [x] Typing indicator dưới câu hỏi đang chờ
- [x] Reviewer + type/lint + test

## Kết quả

**Triển khai xong (chưa commit):**
- Expo module apps/mobile/modules/mlkit-translate: Kotlin (Android com.google.mlkit:translate 17.0.3, build xác nhận) + Swift (iOS Swift, chưa build).
- Tải gói ngôn ngữ: khi bật "Dịch sang" ở màn cài đặt ghi âm; hiện tiến trình (không có progress API, timeout 5 phút); cảnh báo dữ liệu di động; chưa tải xong không bắt đầu ghi có dịch.
- Dịch từng câu cuối trên máy: watchdog 30 giây/câu.
- Lưu trữ bền: SQLite `pending_translations` + sync via PUT /meetings/:id/segments/:seq/translation (idempotent, owner-guarded, retry 404 × 10, drop 400).
- Kết thúc: chờ tất cả dịch xong/lỗi (không timeout tổng hợp), synced, mới gửi `end`.
- Dịch lại: transcript screen on-device re-translate.
- Máy chủ: gỡ translation module, retry endpoint, WS segment_translated events.
- Chính sách quyền riêng tư v4: dịch trên điện thoại, text không gửi Google để dịch (chưa phát hành).
- Live transcript: bottom padding + safe-area.
- Hỏi AI (ask + meeting-chat): Android ≥35 manual padding, <35 rely resize; iOS frame-change; empty state không lộn; typing indicator dưới câu.
- Reviewer: 0 critical; W1, W2, W4, W5, S2, S3, S7 fixed.
- Test từ clean runs: mobile 244 suites / 1634; API unit 466, e2e 184; typecheck/lint clean.

**Giới hạn chấp nhận (W3):**
- App killed khi End chờ dịch cuối cùng → cuộc họp tiếp tục là ghi âm; người dùng bấm End lại.

**Hoãn sang phase sau (W7, S1, S4):**
- W7: một PUT/dịch (chậm khi offline có nhiều) vs 300/phút tính toán.
- S1: bản dịch cũ bị ghi đè sau sửa câu.
- S4: đóng translator idle.
- ML Kit telemetry: câu trong chính sách (chưa viết).
- Tệp lớn: recording-session.ts 271 dòng, sync-worker.ts 215 dòng (vượt 200).

## Chuẩn hoàn thành
Trên Xiaomi: bật dịch tải gói xong; dịch hiện <1s dưới câu; bấm kết thúc chờ câu cuối; transcript có bản dịch; Hỏi AI gõ không bị che. Test xanh. Device verification pending.
