# Phase 09 · Dịch song song

**Liên kết:** [plan.md](plan.md) · [US-17→19](../../user_stories.md#e3--dịch-song-song) ·
[Mô hình chi phí](../../docs/system-architecture.md#6-mô-hình-chi-phí)

## Tổng quan
**Ưu tiên:** Trung bình · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 05, 07

Dịch từng đoạn ngay trong lúc họp, lưu lại để đọc sau.

## Nhận định then chốt
- Đây là khoản chi lớn nhất trên mỗi cuộc họp: ~180 lượt gọi nếu dịch từng câu. Gom lô 3–5 câu kéo
  xuống còn ~50.
- Bản đặc tả gốc dịch nhưng không lưu — họp xong bản dịch bốc hơi, mâu thuẫn với chính mục tiêu
  "lưu trữ ngữ cảnh". Ở đây bản dịch nằm trong `transcript_segments`.
- Dịch hỏng một câu không được làm hỏng cuộc họp. Lỗi phải cô lập ở mức từng đoạn.
- Vì đắt nên mặc định tắt, và bật thì phải nói thẳng cho người dùng biết là tốn tiền.

## Yêu cầu
**Chức năng:** bật/tắt dịch trước và trong cuộc họp; chọn ngôn ngữ đích theo từng cuộc họp; hiện bản
dịch dưới câu gốc; lưu bản dịch; ba chế độ xem sau cuộc họp (gốc / dịch / song song); thử lại câu lỗi.
**Phi chức năng:** bản dịch về trong 3 giây; gom lô để giảm số lượt gọi; đo token cho từng lượt.

## Kiến trúc
`TranslationService` phía backend gom các đoạn trong cửa sổ 2 giây hoặc đủ 5 đoạn, gửi một lượt tới
Gemini, tách kết quả về từng `seq`, ghi vào `transcript_segments.translated_text` rồi phát
`segment_translated` cho từng đoạn.

Cửa sổ gom lô đặt ở cấu hình. Lỗi một lô thì thử lại từng đoạn riêng lẻ, để một câu hỏng không kéo
cả lô xuống.

## File liên quan
**Tạo:** `apps/api/src/translation/translation.module.ts` · `translation.service.ts` ·
`translation-batcher.ts` · `apps/mobile/src/components/translated-segment.tsx` ·
`apps/mobile/src/components/view-mode-switch.tsx`
**Sửa:** `apps/api/src/realtime/meeting.gateway.ts` (móc dịch vào luồng) ·
`apps/api/src/ai/gemini.client.ts` (dùng chung với Phase 11)

## Các bước thực hiện
1. `translation-batcher`: gom theo cửa sổ thời gian hoặc số lượng, tùy cái nào đến trước.
2. Prompt dịch giữ nguyên định dạng và trả về theo đúng số đoạn đầu vào, có `seq` để ghép lại.
3. Ghi `translated_text` + `translated_to` vào `transcript_segments`.
4. Phát `segment_translated{seq, translated_text, translated_to}` qua WebSocket.
5. Lỗi cả lô → thử lại từng đoạn; đoạn nào vẫn hỏng thì đánh dấu để client cho thử lại tay.
6. Client: hiện bản dịch dưới câu gốc, khác kiểu chữ, có chỗ bấm thử lại khi lỗi.
7. Công tắc ba chế độ xem trên màn hình chi tiết cuộc họp.
8. Bật dịch hiện cảnh báo chi phí; ghi lượng token vào `usage_records`.

## Todo
- [ ] Bộ gom lô có cửa sổ cấu hình được
- [ ] Prompt dịch giữ ánh xạ seq
- [ ] Ghi bản dịch vào transcript_segments
- [ ] Phát segment_translated
- [ ] Cô lập lỗi ở mức từng đoạn + thử lại
- [ ] Hiển thị bản dịch trên client
- [ ] Công tắc ba chế độ xem
- [ ] Cảnh báo chi phí + ghi nhận token

## Chuẩn hoàn thành
- Bản dịch hiện trong 3 giây ở phân vị 95.
- Một câu dịch lỗi không làm đứt cuộc họp; các câu sau vẫn dịch bình thường.
- Mở lại cuộc họp cũ thấy đủ bản dịch, chuyển được ba chế độ xem.
- Gom lô giảm số lượt gọi xuống dưới 60 cho cuộc họp 60 phút — đo bằng `usage_records`.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| LLM trả về sai số đoạn, ghép lệch seq | Bắt buộc trả JSON có `seq`; sai schema thì hạ xuống dịch từng đoạn |
| Gom lô làm bản dịch trễ quá 3 giây | Cửa sổ là cấu hình; đo rồi chỉnh |
| Chi phí vượt dự kiến | Ghi token từ ngày đầu; hạn mức chặn cứng ở Phase 16 |

## Bảo mật
Nội dung gửi đi dịch là dữ liệu nhạy cảm — phải nằm trong phạm vi đồng ý ở
[US-04](../../user_stories.md#us-04--thông-báo-và-ghi-nhận-sự-đồng-ý-ghi-âm). Không log nội dung prompt.

## Tiếp theo
Không chặn phase nào. Chạy song song với nhánh AI (11–15).
