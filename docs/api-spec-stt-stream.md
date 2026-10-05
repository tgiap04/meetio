# Meetio — Socket `/stt-stream` (Phase 19)

**Cập nhật:** 2026-10-05  
**Liên quan:** [Đặc tả API](api-spec.md#8b-socket-stt-stream-phase-19) · [Kiến trúc](system-architecture.md#chế-độ-nhận-diện-phase-18) · [Mô hình dữ liệu](data-model.md)

Trang con của [api-spec.md §8b](api-spec.md#8b-socket-stt-stream-phase-19): đặc tả đầy đủ của socket nhận diện dạng luồng.

Nhận diện **dạng luồng** ở chế độ máy chủ: app đẩy PCM thô qua socket.io, server chuyển tiếp tới một
phiên Gemini Live cho mỗi socket và trả chữ về ngay. Chỉ dùng khi điện thoại không nhận diện được trên
máy; luồng hỏng thì app tự lùi về `POST /stt/transcribe` ([api-spec §4](api-spec.md#nhận-diện-giọng-nói-trên-máy-chủ-phase-18)).
Hằng số và kiểu dùng chung ở `packages/shared/src/stt/stt-stream.types.ts`.

**Namespace:** `/stt-stream` · Xác thực lúc bắt tay y hệt `/meeting-room` (cùng cặp lỗi `UNAUTHORIZED` /
`TOKEN_EXPIRED`). Một socket giữ tối đa một luồng, đóng cùng socket.

## Client → Server

| Sự kiện | Payload | Ghi chú |
|---------|---------|---------|
| `stt_start` | `{language, meeting_id?}` | `language` = `vi-VN` \| `en-US`; `meeting_id` (UUID) chỉ để gán `usage_records`, không phải cuộc họp của mình thì bị bỏ qua lặng lẽ. Ack `{ok:true}` hoặc `{ok:false,error:{code,message}}` |
| `stt_audio` | khung nhị phân | PCM16 little-endian, **16 kHz, mono** (`audio/pcm;rate=16000`). App gom 100–200 ms (3,2–6,4 KB; mobile mặc định 150 ms). Không có ack |
| `stt_stop` | — | Ack `{ok:true}` sau khi những chữ cuối đã được đẩy xuống (chờ có giới hạn `STT_LIVE_FLUSH_MS`); chưa `stt_start` thì ack `STREAM_NOT_STARTED` |

## Server → Client

| Sự kiện | Payload | Ghi chú |
|---------|---------|---------|
| `stt_partial` | `{text}` | Chữ tạm của đoạn đang nói, **thay** partial trước |
| `stt_final` | `{text}` | Một đoạn đã chốt |
| `stt_error` | `{code, message}` | Luồng **đã kết thúc**; app lùi về chế độ đoạn 10 giây (trừ `TOKEN_EXPIRED`: làm mới token, kết nối lại, bắt đầu lại) |

## Mã lỗi

Từ chối `stt_start` (trong ack, kiểm theo thứ tự này, **trước khi** thay luồng cũ của người dùng):

| Mã | Khi nào |
|----|---------|
| `VALIDATION_ERROR` | `language` không hỗ trợ; `meeting_id` không phải UUID |
| `RATE_LIMITED` | Quá 5 lần bắt đầu / phút / người dùng (`STT_LIVE_MAX_STARTS_PER_MIN`) |
| `CONSENT_REQUIRED` | Chưa đồng ý bản hiện hành |
| `AI_SERVICE_UNAVAILABLE` | Chưa cấu hình `GEMINI_API_KEY`; vượt số luồng đồng thời toàn hệ thống (`STT_LIVE_MAX_CONCURRENT`, 0 = không giới hạn); không mở được phiên Gemini Live |
| `QUOTA_EXCEEDED` | Vượt hạn mức token tháng |
| `STREAM_REPLACED` | Một `stt_start` mới hơn của cùng người dùng chen vào khi đang mở |

Luồng đang chạy bị kết thúc bằng `stt_error`:

| Mã | Khi nào |
|----|---------|
| `STREAM_NOT_STARTED` | `stt_audio` trước `stt_start` — báo **một lần**; quá 20 khung lạc thì server ngắt socket |
| `VALIDATION_ERROR` | Khung rỗng, độ dài lẻ hoặc không phải dữ liệu nhị phân |
| `RATE_LIMITED` | Khung > 65.536 byte, hoặc gửi nhanh hơn thời gian thực: thùng 5 giây dự trữ, bền vững tối đa 1,5× thời gian thực |
| `QUOTA_EXCEEDED` | Hết hạn mức giữa chừng (kiểm mỗi phút) |
| `CONSENT_REQUIRED` | Mất đồng ý hiện hành giữa chừng (kiểm mỗi phút cùng nhịp với hạn mức) |
| `TOKEN_EXPIRED` | Access token của socket hết hạn (kết thúc sau `exp` + 5 giây) |
| `STREAM_REPLACED` | Người dùng mở luồng mới hơn; luồng cũ bị đóng — thường do kết nối lại mà socket chết chưa bị server phát hiện |
| `AI_SERVICE_UNAVAILABLE` | Mất phiên Gemini Live và không phục hồi được |

## Xoay phiên và khử trùng lặp

Gemini cắt một phiên Live sau 10 phút. Server mở phiên mới **trước** hạn: xoay ở phút thứ 9
(`STT_LIVE_ROTATE_MS` = 540.000 ms), bắt đầu tìm chỗ ngắt từ phút 8:30 (`STT_LIVE_QUIET_WINDOW_MS` =
30.000 ms) — ngay khi người nói ngừng ≥ 1 giây — và tới hạn thì xoay bất kể. Phiên mới được phát lại 2,5
giây âm thanh cuối (`STT_LIVE_OVERLAP_MS`, từ bộ đệm vòng 3 giây **chỉ trong RAM**) nên không rơi chữ ở
mối nối; phiên cũ chốt nốt chữ rồi đóng; các `final` đầu của phiên mới được lọc bỏ phần lặp lại với những gì
đã gửi (`stt-seam-filter.ts`, so khớp bỏ hoa/thường và dấu câu, cần trùng ≥ 2 từ liền nhau). Phiên rớt bất ngờ
được mở lại theo cách tương tự; hai lần rớt cách nhau dưới 5 giây thì kết thúc luồng thay vì lặp mãi. Một
partial chưa kịp thành final lúc đóng phiên được giữ lại thành `final`.

## Biến môi trường

Đọc trong `apps/api/src/stt/stt.module.ts` và `ai.module.ts`; **chưa có trong `.env.example`** — chạy
production bằng mặc định, các biến `STT_LIVE_*` chủ yếu để test rút ngắn thời gian.

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `GEMINI_LIVE_TRANSCRIBE_MODEL` | `gemini-3.5-transcribe-live` | Model phiên Live |
| `STT_LIVE_ROTATE_MS` | 540000 | Tuổi phiên khi bắt buộc xoay |
| `STT_LIVE_QUIET_WINDOW_MS` | 30000 | Cửa sổ trước hạn để xoay ở chỗ ngắt |
| `STT_LIVE_OVERLAP_MS` | 2500 | Âm thanh phát lại vào phiên mới |
| `STT_LIVE_FLUSH_MS` | 2000 | Chờ tối đa để chữ cuối chốt khi kết thúc/xoay |
| `STT_LIVE_MAX_STARTS_PER_MIN` | 5 | Số lần `stt_start` / phút / người dùng |
| `STT_LIVE_MAX_CONCURRENT` | 0 (không giới hạn) | Số phiên Live mở cùng lúc toàn hệ thống |
| `STT_LIVE_USAGE_INTERVAL_MS` | 60000 | Nhịp ghi usage + kiểm hạn mức + kiểm đồng ý |

## Ghi usage và quyền riêng tư

Thời gian Live được ghi vào `usage_records` với `operation = 'stt-live'`: mỗi phút một dòng và một dòng
cho phần dư lúc kết thúc, `input_tokens` = giây × 32 (Gemini tính âm thanh 32 token/giây), `output_tokens`
= 0, `model` = model Live. Âm thanh chỉ nằm trong RAM (bộ đệm vòng, tối đa vài giây) và **không ghi đĩa,
không ghi log**; chữ nhận được cũng không vào log ([NFR-02](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr),
[NFR-04](../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)).
