# Phase 07 · Ghi âm & nhận diện giọng nói

**Liên kết:** [plan.md](plan.md) · [US-07→13, US-16](../../user_stories.md#e2--ghi-âm--nhận-diện-giọng-nói) ·
[Phase 00](phase-00-spike-stt-feasibility.md)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** **Phase 00 (cổng chặn)**, 05, 06

Toàn bộ trải nghiệm ghi cuộc họp phía client: chọn nguồn âm và chất lượng, bật mic, hiện chữ, chạy
nền, kết thúc.

**Bối cảnh dùng chính:** điện thoại đặt cạnh laptop đang họp trực tuyến, thu tiếng phát ra từ loa.

> **KHÔNG KHỞI CÔNG khi Phase 00 chưa đóng.** Kết quả spike quyết định phase này giữ nguyên hình hài
> hay phải viết lại theo hướng STT đám mây.

## Nhận định then chốt
- Engine trên thiết bị **sẽ** tự ngắt. Vòng khởi động lại không phải tính năng phụ, nó là cơ chế cốt lõi.
- Mọi khoảng gián đoạn phải hiện rõ trong transcript. Nối liền hai đoạn như chưa có gì xảy ra là nói
  dối người dùng về chất lượng dữ liệu họ đang cầm.
- Âm thanh vào là một luồng trộn lẫn từ loa laptop. Không tách được người nói, và người dùng cũng
  không bấm chọn được cho người ở đầu bên kia cuộc gọi → **US-13 đã bỏ**, transcript không có tên.
- Tự cuộn phải nhường quyền cho người dùng: đang đọc ngược lên mà bị giật xuống là lỗi khó chịu bậc nhất.

## Yêu cầu
**Chức năng:** bắt đầu / tạm dừng / tiếp tục / kết thúc; hiện chữ thời gian thực có phân biệt phần
chưa chốt; tự cuộn có nhường quyền; chọn ngôn ngữ; chọn nguồn âm (US-42) và chất lượng (US-43);
chạy nền và khóa màn hình;
đánh dấu khoảng gián đoạn.
**Phi chức năng:** chữ hiện trong 2 giây sau khi dứt câu; chạy liên tục 60 phút; khởi động lại trong 500ms.

## Kiến trúc
Máy trạng thái ghi âm ở client soi gương máy trạng thái server (Phase 04) — đồng bộ qua REST, không
đoán. Engine nhận diện bọc trong một service riêng để nếu Phase 00 bắt đổi sang đám mây thì chỉ thay
đúng service đó.

Danh sách transcript dùng `FlashList` ảo hóa. Đoạn chưa chốt giữ ở trạng thái cục bộ, chốt xong mới
đẩy vào hàng đợi gửi (Phase 08).

## File liên quan
**Tạo:** `apps/mobile/src/recording/stt.service.ts` (lớp bọc engine — điểm hoán đổi) ·
`recording/recording-machine.ts` · `recording/restart-loop.ts` ·
`apps/mobile/app/(app)/meeting/record.tsx` · `src/components/transcript-list.tsx` ·
`src/components/audio-source-picker.tsx` · `app.json` (quyền + chế độ chạy nền)

## Các bước thực hiện
1. `stt.service.ts` — giao diện trừu tượng: `start(lang)`, `stop()`, sự kiện `partial`/`final`/`ended`.
   Bản hiện thực chọn theo kết luận Phase 00.
2. `restart-loop.ts` — bắt sự kiện ngắt, bật lại trong 500ms, ghi `gap_before_ms` cho đoạn kế tiếp.
3. Máy trạng thái ghi âm ở client, đồng bộ với server qua các endpoint Phase 04.
4. Màn hình ghi: chỉ báo đang ghi, đồng hồ, trạng thái đồng bộ, danh sách transcript ảo hóa.
5. Tự cuộn có nhường quyền: người dùng cuộn ngược thì dừng tự cuộn, hiện nút "Xuống dòng mới nhất"
   kèm số đoạn chưa đọc.
6. Bộ chọn nguồn âm thanh (micro thiết bị / thiết bị Bluetooth ngoài) và mức chất lượng; mất kết nối
   Bluetooth giữa chừng thì tự chuyển về micro và ghi mốc chuyển, không dừng phiên.
7. Chọn ngôn ngữ trước khi bắt đầu, chỉ liệt kê ngôn ngữ thiết bị thực sự hỗ trợ.
8. Chạy nền: foreground service (Android) có nút Kết thúc trên notification; background audio (iOS).
9. Kết thúc: chờ hàng đợi rỗng → gọi `end` → chuyển sang màn hình chi tiết.

## Todo
- [ ] Lớp bọc engine STT (điểm hoán đổi)
- [ ] Vòng khởi động lại + đánh dấu gián đoạn
- [ ] Máy trạng thái ghi âm đồng bộ với server
- [ ] Màn hình ghi + danh sách ảo hóa
- [ ] Tự cuộn nhường quyền người dùng
- [ ] Chọn nguồn âm thanh + chế độ chất lượng (US-42, US-43)
- [ ] Chọn ngôn ngữ
- [ ] Chạy nền trên cả hai nền tảng
- [ ] Luồng kết thúc có chờ đồng bộ

## Chuẩn hoàn thành
- Ghi liên tục 60 phút không cần chạm tay, đạt ngưỡng mất chữ mà Phase 00 xác lập.
- Khóa màn hình 10 phút rồi mở lại, buổi ghi vẫn chạy và chữ không đứt.
- Mọi khoảng gián đoạn hiện rõ trong transcript.
- Cuộn ngược lên đọc không bị giật xuống dòng mới.
- Kết thúc khi còn đoạn chờ thì hiện tiến trình đồng bộ, không mất đoạn nào.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Phase 00 kết luận phải đổi sang đám mây | Chỉ `stt.service.ts` phải viết lại — đó là lý do có lớp bọc |
| iOS cắt phiên chạy nền | Phát hiện và khởi động lại; ghi rõ gián đoạn; nêu giới hạn trong tài liệu app |
| Danh sách dài làm tụt khung hình | FlashList ảo hóa, đo trên máy tầm thấp chứ không phải máy đầu bảng |

## Bảo mật
Audio không bao giờ rời thiết bị ([NFR-02](../../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)) —
trừ khi Phase 00 lật lại quyết định này, và khi đó phải xin đồng ý lại từ người dùng.

## Tiếp theo
Mở khóa Phase 08 (hàng đợi ngoại tuyến) và Phase 09 (dịch song song).
