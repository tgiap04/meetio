---
phase: 19
title: Nhận diện kiểu stream qua máy chủ (Gemini Live)
status: implemented — awaiting device verification
priority: high
blockedBy: [18]
---

# Phase 19 — Stream âm thanh → Gemini Live (chữ trễ ~1–2s)

**Liên kết:** [nghiên cứu](../reports/researcher-2026-10-05-streaming-stt.md) · [Phase 18](phase-18-server-stt-fallback.md) · clarifications 2026-10-05

## Tổng quan
Chế độ máy chủ hiện chia đoạn 10s → chữ trễ 10–15s. Thay bằng stream PCM liên tục qua socket.io tới
máy chủ, máy chủ giữ một phiên Gemini Live `gemini-3.5-transcribe-live` và trả chữ tạm + chữ chốt.
Cách chia đoạn của Phase 18 giữ lại làm đường dự phòng khi stream lỗi.

## Kiến trúc
```
expo-audio useAudioStream(16kHz,int16) ─100–200ms frame─▶ socket.io /stt-stream (JWT, consent v3)
      ▲  stt_partial / stt_final                              │ SttStreamGateway: 1 phiên Live / socket
      └──────────────────────────────────────────────────────┘ sendRealtimeInput(audio/pcm;rate=16000)
server-stream-stt-engine (SttEngine): partial → onResult(text,false), final → onResult(text,true)
→ pipeline/assembler/hàng đợi như cũ
```
- Xoay phiên Live trước mốc 10 phút (ưu tiên lúc im lặng), chồng ngắn, khử trùng lặp chữ ở mối nối.
- Âm thanh chỉ trong RAM (ring buffer ~3s để nối phiên); không lưu, không log; usage `stt-live` theo phút.
- Owner guard + consent như Phase 18; key gói trả phí; lỗi/hết quota → client chuyển sang chia đoạn.
- Chế độ chất lượng cao: chữ tạm từng từ; tiết kiệm pin: chỉ câu chốt.

## Các bước
1. **Spike trên Xiaomi** (chặn các bước sau): `useAudioStream` chạy nền khi khóa màn hình ≥10 phút cùng
   foreground service sẵn có; nếu tắt tiếng → dùng `@siteed/audio-studio`.
2. API: `GeminiClient.openTranscribeSession` (ai.live.connect, ghim 1 key/phiên), `SttStreamGateway` (auth,
   consent, giới hạn 1 phiên/người, xoay phiên, relay partial/final, usage), e2e với Live giả.
3. Mobile: `server-stream-stt-engine` + adapter native; chọn stream mặc định ở chế độ máy chủ, rơi về chia đoạn khi lỗi.
4. Docs + chính sách (stream thay cho "đoạn 10 giây").

## Kết quả

**Triển khai xong (chưa commit):**
- API `/stt-stream` socket.io namespace → Gemini Live `gemini-3.5-transcribe-live`
- Rotation <9min với seam de-dup; ring buffer RAM only (không lưu, không log)
- Usage `stt-live` per minute; consent re-check mỗi phút; token-expiry enforcement (TOKEN_EXPIRED → client reconnect)
- Start rate limit 5/min, optional max concurrent; owner guard
- Mobile: expo-audio AudioStream PCM16 16k engine với reconnect, one-time fallback tới chunked engine

**Vấn đề còn mở (chặn device test):**
- Xiaomi device spike (background với screen locked ≥10 min)
- Real latency, Vietnamese accuracy, Gemini fragment granularity, free-tier concurrency limits
- File size: stt-live-session.ts 232 lines (over 200 limit)

## Chuẩn hoàn thành
Trên Xiaomi: chữ tạm hiện ≤2s, chữ chốt khi ngắt câu; họp 30 phút qua ≥3 lần xoay phiên không mất/lặp chữ;
khóa màn hình vẫn ghi; test API + mobile xanh.

## Rủi ro
Nền Android của AudioStream (spike) · model mới (8/2026) · giới hạn phiên đồng thời mỗi key chưa rõ ·
băng thông ~115 MB/giờ trên 4G · mối nối xoay phiên · chi phí ≈ $0.54/giờ.
