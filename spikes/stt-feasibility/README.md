# Spike · Khả thi nhận diện giọng nói trên thiết bị (Phase 00)

Code **vứt đi** sau khi có kết luận — không nằm trong workspace yarn của monorepo, không import gì
từ `apps/` hay `packages/`. Kế hoạch: [phase-00](../../plans/260917-1821-meetio-full-implementation/phase-00-spike-stt-feasibility.md) ·
Quyết định đã chốt: [clarifications.md](../../plans/260917-1821-meetio-full-implementation/clarifications.md) ·
Kết quả: [REPORT.md](REPORT.md).

## Thành phần

| Đường dẫn                                       | Việc                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `App.tsx`, `src/`                               | App Expo một màn: chọn cấu hình → Bắt đầu → Đánh dấu phát → Dừng → Chia sẻ log                     |
| `src/recognition-controller.ts`                 | Vòng tự khởi động lại (100ms sau khi phiên chết, giãn dần tới 5s nếu khởi động thất bại liên tiếp) |
| `plugins/with-microphone-foreground-service.js` | Foreground service loại `microphone` cho Android 14+                                               |
| `analysis/analyze-run.mjs`                      | Tính WER, chữ mất mỗi lần restart, thời gian sống, chạy nền — từ log JSONL + bản chép tay          |
| `fixtures/README.md`                            | Yêu cầu với âm thanh mẫu và định dạng bản chép tay                                                 |

Thư viện: [`expo-speech-recognition`](https://github.com/jamsch/expo-speech-recognition) thay cho
`@react-native-voice/voice` ghi trong plan (bản cuối từ 2022, không hỗ trợ New Architecture mà
RN 0.86 bắt buộc). Nó vẫn gọi thẳng `SpeechRecognizer` / `SFSpeechRecognizer`, nên vẫn đo đúng giới hạn nền tảng.

## Build & cài lên máy thật

Cần dev build (module native) — **không chạy được trên Expo Go, không đo trên máy ảo**.

```bash
cd spikes/stt-feasibility
npm install
npx expo run:android --device   # hoặc: npx expo run:ios --device
```

Android: lượt **on-device** cần model tiếng Việt offline. Màn hình báo `vi-VN on-device: KHÔNG`
thì bấm "Tải model tiếng Việt offline", hoặc vào _Cài đặt → Bảo mật & quyền riêng tư → Android
System Intelligence → Nhận dạng lời nói trên thiết bị_. Máy không có tuỳ chọn này thì ghi vào REPORT
là "không hỗ trợ" — **đó là một kết quả**, không phải lỗi setup.

**Máy đo phải chạy Android 13+.** Dưới 13, thư viện chỉ gửi `EXTRA_PREFER_OFFLINE` (gợi ý, service có
quyền bỏ qua) thay vì `createOnDeviceSpeechRecognizer`, và không có chế độ continuous — app chặn
không cho bắt đầu. Máy tầm thấp cũng phải chọn loại chạy Android 13+ (máy dưới 13 vẫn đo được engine network).

## Quy trình một lượt đo

1. Laptop phát `fixtures/meeting-60min.*`, âm lượng cố định (ghi mức vào REPORT), điện thoại đặt 30cm
   hoặc 50cm trước loa. Lượt đối chứng: người đọc to bản chép tay trực tiếp vào máy.
2. Lượt engine **on-device**: bật **chế độ máy bay** trước (app từ chối chạy nếu còn mạng) — offline
   mà vẫn nhận ra chữ là bằng chứng audio không rời máy. iOS không có API cho biết vi-VN có chạy
   on-device không; lượt offline chính là câu trả lời.
3. Chọn Engine / Trạng thái app / Cách thu / Khoảng cách trên app → **Bắt đầu**.
4. Bấm **Đánh dấu phát** đúng lúc bấm play trên laptop — mốc này nối log với bản chép tay; quên bấm
   thì không tính được chữ mất theo restart.
5. Chế độ _Chạy nền_: về màn hình chính. _Khoá màn hình_: bấm nút nguồn. _Tiền cảnh_: để yên (app giữ màn hình sáng).
6. Hết 60 phút → mở app → **Dừng** → **Chia sẻ log** (AirDrop / Drive cá nhân) → lưu vào `runs/` trên máy người đo.

## Phân tích

```bash
npm run analyze -- --reference fixtures/reference.txt runs/*.jsonl              # đọc nhanh
npm run analyze -- --reference fixtures/reference.txt --format md runs/*.jsonl  # dán vào REPORT.md
```

Cách tính:

- **WER** = (thay thế + xoá + chèn) / số chữ bản chép tay, trên chữ đã chuẩn hoá (NFC, chữ thường,
  bỏ dấu câu, **giữ dấu thanh**). Chữ còn ở partial lúc phiên chết được tính là đã nhận ra (app thật vẫn hiển thị nó).
- **Chữ mất do restart** = chữ trong bản chép tay được nói ra trong khoảng từ lúc phiên chết tới lúc
  phiên sau thực sự nghe (`start`), căn theo mốc _Đánh dấu phát_.
- **Gộp kết quả final:** Android trả mỗi câu một final riêng, iOS có thể trả chuỗi cộng dồn cả
  phiên. Final mới bắt đầu bằng phần đã có thì thay thế, không thì nối tiếp (`mergeRecognizedText`).
- **Heartbeat hụt dài nhất:** app ghi heartbeat mỗi 30s; khoảng trống lớn là lúc hệ điều hành treo app.
- **Restart ≤500ms** = tỉ lệ lần khởi động lại đạt AC US-11; lần không bao giờ hồi phục tính là trượt.

## Test

```bash
npm test        # vòng restart (node --test, không cần máy) + công cụ phân tích
npm run typecheck
```

## Rủi ro đã biết (để quan sát, không vá)

- **Log ghi theo lô mỗi 2 giây** (xả ngay khi xuống nền). App bị hệ thống giết đột ngột thì mất tối
  đa ~2 giây sự kiện cuối — dòng cụt cuối file được `analysis/` bỏ qua.

- **iOS chạy nền:** app chỉ sống khi audio session còn hoạt động; khoảng nghỉ giữa hai phiên có thể
  khiến iOS treo app. Nếu log cho thấy restart thất bại sau `app_background` thì đó là kết quả cần báo cáo.
- **`react-native-background-actions`** chưa được React Native Directory đánh dấu đã test với New
  Architecture. Build Android đã qua; phải xác nhận notification "STT spike đang ghi" hiện lên trên máy thật.
