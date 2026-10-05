# Nghiên cứu: nhận diện giọng nói kiểu stream qua máy chủ (2026-10-05)

**Đề xuất:** `expo-audio` `useAudioStream` (PCM16 16 kHz mono) → socket.io binary → NestJS gateway →
Gemini Live `gemini-3.5-transcribe-live` (TEXT only, `inputAudioTranscription{languageCodes, mode:'VERBATIM'}`). Effort M.

- Model chuyên STT stream (8/2026), dùng API key `@google/genai` `ai.live.connect` — không cần GCP/service account.
- vi-VN, en-US hỗ trợ. Partial: `serverContent.interimInputTranscription`; final: `serverContent.inputTranscription`.
- Giới hạn **10 phút/phiên** → xoay phiên ~9 phút, chồng 2–3s, khử trùng lặp chữ ở mối nối.
- Giá ≈ $0.009/phút (≈ $0.54/60 phút) so với ~$0.05–0.15 của cách chia đoạn hiện tại.
- **Key phải ở gói trả phí** — gói miễn phí Google dùng dữ liệu để cải thiện sản phẩm (trái chính sách).
- `expo-audio` 57 có `useAudioStream`/`AudioStream` (onBuffer int16) — không cần module native mới.
  Rủi ro: Android `AudioStream` dùng `AudioRecord` không tự chạy foreground service → cần spike khóa màn hình trên Xiaomi.
  Dự phòng: `@siteed/audio-studio`.
- Cloud STT v2 Chirp 3: vi-VN GA nhưng cần GCP service account, ~$0.016/phút, 5 phút/stream → hạng 3.
- Chưa kiểm chứng: độ trễ thật, WER tiếng Việt, giới hạn phiên đồng thời mỗi key, nền Android.

Nguồn: ai.google.dev/gemini-api/docs/live-api/live-transcribe · …/models/gemini-3.5-transcribe · …/pricing ·
docs.cloud.google.com/speech-to-text/docs/models/chirp-3 · node_modules/expo-audio/build/AudioStream.types.d.ts
