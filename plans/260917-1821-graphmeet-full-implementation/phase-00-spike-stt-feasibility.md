# Phase 00 · Spike khả thi nhận diện giọng nói — **CỔNG CHẶN**

**Liên kết:** [plan.md](plan.md) · [US-11](../../user_stories.md#us-11--nhận-diện-liên-tục-suốt-cuộc-họp-dài) ·
[OQ-01](../../user_stories.md#5-câu-hỏi-còn-mở) · [Luồng 1](../../docs/system-architecture.md#2-luồng-1--ghi-và-nhận-diện-thời-gian-thực)

## Tổng quan
**Ưu tiên:** Cao nhất · **Trạng thái:** ⬜ pending · **Chặn:** Phase 07

Đo bằng số liệu thật xem engine nhận diện giọng nói trên thiết bị có gánh nổi một cuộc họp 60 phút
hay không. Đây là spike đo đạc, không phải code sản phẩm — mọi thứ viết ra ở đây đều vứt đi sau khi
có kết luận.

## Nhận định then chốt
- `SpeechRecognizer` (Android) và `SFSpeechRecognizer` (iOS) đều được thiết kế cho câu lệnh ngắn:
  tự ngắt khi im lặng và có trần thời lượng mỗi phiên. Hội thoại dài nằm ngoài mục đích thiết kế.
- Mỗi lần khởi động lại phiên là một cơ hội rớt chữ. Tỉ lệ rớt là con số phải đo, không phải đoán.
- `@react-native-voice/voice` là lớp bọc mỏng — mọi giới hạn của tầng dưới đều lộ nguyên vẹn lên trên.
- Nếu kết luận là "không đạt", cam kết "audio không rời thiết bị" ([NFR-02](../../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr))
  sụp đổ, kéo theo chính sách quyền riêng tư, mô hình chi phí và cả Luồng 1.

## Yêu cầu
**Chức năng:** app Expo tối giản chỉ để ghi và log — bật nhận diện, tự khởi động lại khi bị ngắt,
ghi nhật ký mọi sự kiện kèm mốc thời gian, xuất ra file để phân tích.

**Phi chức năng:** đo trên tối thiểu 2 máy Android (một máy tầm thấp) và 2 máy iOS, ở cả chế độ
foreground, chạy nền và khóa màn hình.

## Kiến trúc
App một màn hình, không backend, không cơ sở dữ liệu. Ghi ra JSONL tại chỗ:
`{event, timestamp, session_id, text?, error?}` với `event` thuộc
`start | partial | final | auto_stop | restart | error | app_background`.

Phát lại một bản ghi âm cuộc họp thật (60 phút, nhiều người nói, có xen tiếng Việt và tiếng Anh) qua
loa để mọi lần đo dùng chung một nguồn âm — có vậy mới so sánh được giữa các thiết bị.

## File liên quan
**Tạo:** `spikes/stt-feasibility/` (app Expo độc lập, không nằm trong monorepo sản phẩm) ·
`spikes/stt-feasibility/REPORT.md` (kết quả đo) · `spikes/stt-feasibility/fixtures/` (file âm thanh mẫu)
**Không đụng tới:** mọi thứ khác — spike phải cô lập hoàn toàn.

## Các bước thực hiện
1. Dựng app Expo trần với `@react-native-voice/voice`, một nút bật/tắt và khung log.
2. Cài vòng tự khởi động lại: bắt sự kiện `onSpeechEnd`/`onSpeechError`, bật lại trong 500ms, ghi log.
3. Thêm foreground service (Android) và background audio mode (iOS).
4. Chuẩn bị file âm thanh mẫu 60 phút, có bản chép tay chính xác làm mốc đối chiếu.
5. Chạy đo: 3 lần × 4 thiết bị × 3 chế độ (foreground / nền / khóa màn hình).
6. Đối chiếu văn bản thu được với bản chép tay, tính WER và tỉ lệ chữ mất ở mỗi lần khởi động lại.
7. Viết `REPORT.md` kèm số liệu thô, và ra khuyến nghị: **giữ trên thiết bị** hay **chuyển đám mây**.
8. Nếu khuyến nghị là đám mây → viết luôn phần so sánh nhà cung cấp (Google STT / Deepgram / Whisper)
   theo bốn tiêu chí: chi phí mỗi giờ, độ trễ, hỗ trợ tiếng Việt, có tách người nói hay không.

## Todo
- [ ] Dựng app Expo spike
- [ ] Cài vòng tự khởi động lại kèm log
- [ ] Hỗ trợ chạy nền trên cả hai nền tảng
- [ ] Chuẩn bị âm thanh mẫu + bản chép tay đối chiếu
- [ ] Chạy đủ 36 lượt đo
- [ ] Tính WER và tỉ lệ mất chữ
- [ ] Viết REPORT.md kèm khuyến nghị
- [ ] Nếu chuyển đám mây: so sánh nhà cung cấp
- [ ] Trình kết quả để chốt hướng trước khi mở Phase 07

## Chuẩn hoàn thành
- `REPORT.md` có số liệu đo thật, không có chỗ nào ghi "ước chừng".
- Trả lời được bốn câu: chạy liên tục được bao nhiêu phút? rớt bao nhiêu chữ mỗi lần khởi động lại?
  chạy nền có sống không? WER tiếng Việt là bao nhiêu?
- Có khuyến nghị dứt khoát kèm lý do dựa trên số đo.
- Quyết định được ghi vào [OQ-01](../../user_stories.md#5-câu-hỏi-còn-mở) và câu hỏi đó khép lại.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Đo trên máy mô phỏng cho kết quả sai lệch | Bắt buộc đo trên máy thật, ghi rõ model và phiên bản OS |
| Chỉ đo tiếng Anh rồi suy ra tiếng Việt | Mẫu âm thanh bắt buộc là cuộc họp tiếng Việt thật |
| Spike phình thành sản phẩm | Giới hạn cứng 5 ngày; code spike không được đưa vào monorepo |

## Bảo mật
Âm thanh mẫu không được chứa nội dung kinh doanh thật. File log không rời máy của người đo.

## Tiếp theo
Kết quả mở khóa Phase 07. Nếu khuyến nghị là chuyển đám mây → phải sửa
[NFR-02](../../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr), mục 0 và mục 6 của
[kiến trúc](../../docs/system-architecture.md), rồi viết lại Phase 07 trước khi khởi công.
