# Phase 07 · Ghi âm & nhận diện giọng nói

**Liên kết:** [plan.md](plan.md) · [US-07→13, US-16](../../user_stories.md#e2--ghi-âm--nhận-diện-giọng-nói) ·
[Phase 00](phase-00-spike-stt-feasibility.md)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** 🟡 **implemented — pending Phase 00 real-device verification** · **Phụ thuộc:** **Phase 00 (cổng chặn)**, 05, 06

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
- [x] Lớp bọc engine STT (điểm hoán đổi)
- [x] Vòng khởi động lại + đánh dấu gián đoạn
- [x] Máy trạng thái ghi âm đồng bộ với server
- [x] Màn hình ghi + danh sách ảo hóa
- [x] Tự cuộn nhường quyền người dùng
- [x] Chọn nguồn âm thanh + chế độ chất lượng (US-42, US-43)
- [x] Chọn ngôn ngữ
- [~] Chạy nền trên cả hai nền tảng — code + simulated test done; real device pending (Phase 00 measurements)
- [x] Luồng kết thúc có chờ đồng bộ

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
Phase 08 được mở khóa (hàng đợi ngoại tuyến). Phase 09 (dịch song song) được mở khóa (5, 07 xong). Phase 17 chờ Phase 00 test thực tế.

## Thiết kế thi công (2026-09-27)
Quyết định người dùng: [clarifications.md › Phase 07–08](clarifications.md). Làm **gộp với Phase 08**; cổng Phase 00
được người dùng mở — số đo máy thật vẫn là điều kiện chốt ngưỡng mất chữ.

**Engine (`src/recording/stt-engine.ts` + `expo-stt-engine.ts`):** file duy nhất import `expo-speech-recognition`
(điểm hoán đổi, mock trong jest). Luôn `requiresOnDeviceRecognition: true`, `continuous: true`, `addsPunctuation: false`.
Ngôn ngữ liệt kê = `installedLocales` (on-device) ∩ {vi-VN, en-US}; rỗng → thẻ hướng dẫn tải gói offline, nút Bắt đầu khoá.
iOS `iosCategory` bật `allowBluetooth` khi chọn thiết bị ngoài.

**Vòng khởi động lại (`restart-loop.ts`):** port nguyên lõi spike (100ms, giãn nhịp khi lỗi liên tiếp, bỏ kết quả phiên cũ
trong lúc chờ `start`). Thêm: đo khoảng chết (phiên chết → phiên mới `start`), gắn `gap_before_ms` vào đoạn chốt kế tiếp
khi ≥ 1000ms (dưới 1 giây không hiện, vẫn log). Tạm dừng/tiếp tục không tính là gián đoạn.

**Đoạn chốt (`segment-assembler.ts`):** `started_at_ms` = partial đầu tiên của câu, `ended_at_ms` = lúc `final`, tính
theo đồng hồ tường từ `started_at` của cuộc họp. Seq cấp bởi hàng đợi (Phase 08), liên tục từ 1.

**Phiên ghi (`recording-session.ts` + `recording.store.ts`):** idle → recording ⇄ paused → ending → ended. Store Zustand chỉ
giữ trạng thái client của phiên (không phải dữ liệu server). Tạm dừng = dừng engine hẳn (US-09).

**Chế độ (US-43):** `high` = `interimResults` + sóng âm từ `volumechange`; `standard` = chỉ `final`, không sóng âm. Nguồn âm và
chế độ nhớ cho phiên sau (secure-store, như `device-preferences`).

**Chạy nền:** Android foreground service loại `microphone` (`react-native-background-actions` + config plugin như spike),
chạm notification mở lại màn ghi (`meetio://recording-live`). iOS `UIBackgroundModes: audio`.

**Màn hình:** 05 Cài đặt ghi âm dùng dữ liệu thật; ẩn khối dịch tới Phase 09. 06 Đang ghi: đồng hồ thật (trừ tạm dừng),
sóng âm, chỉ báo đồng bộ, danh sách `FlatList` (như transcript Phase 10, không thêm FlashList), partial khác màu, mốc gián
đoạn, tự cuộn nhường quyền + nút "Xuống dòng mới nhất (N)"; ẩn tab ngôn ngữ dịch; X = thu nhỏ về Home (vẫn ghi, Home có
banner quay lại). Kết thúc: xác nhận → tiến trình đồng bộ → 07 với trạng thái xử lý thật → chi tiết cuộc họp.

**Sai lệch đã ghi nhận (2026-09-27):**
- Android notification không có nút Kết thúc (react-native-background-actions không hỗ trợ action) — chạm vào mở màn ghi
- Không tự phát hiện Bluetooth / ghi mốc chuyển nguồn (quyết định người dùng); Bluetooth do hệ điều hành định tuyến, không module native hay marker switch
- `FlatList` thay `FlashList` ảo hóa
- Không thêm `expo-network` — trạng thái socket.io và lỗi HTTP đủ biết mất mạng
- expo-speech-recognition patched via .yarn/patches để fail closed trên iOS (luôn requiresOnDeviceRecognition = true, installedLocales = on-device)
- iOS SQLite queue file không thể loại khỏi iCloud backup trực tiếp (chỉ segment chưa được ack rò ra, không nội dung final)
- Nhãn gián đoạn: "— Gián đoạn N giây —"
