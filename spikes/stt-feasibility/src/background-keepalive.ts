// Giữ app sống khi xuống nền / khoá màn hình.
// Android: foreground service loại `microphone` (khai báo ở plugins/with-microphone-foreground-service.js).
//   Phải bật khi app còn ở tiền cảnh — Android 14+ cấm khởi động service micro từ nền.
// iOS: UIBackgroundModes=audio trong app.json; app chỉ sống khi audio session còn hoạt động, nên
//   khoảng nghỉ 500ms giữa hai phiên chính là chỗ iOS có thể treo app. Spike đo đúng điều đó,
//   không vá — sản phẩm thật phải biết con số này.

import { PermissionsAndroid, Platform } from 'react-native';
import BackgroundService from 'react-native-background-actions';

// Task không làm gì: service chỉ để giữ tiến trình ở mức ưu tiên foreground.
// Vòng nhận diện vẫn chạy trên JS thread chính.
const idleUntilStopped = () =>
  new Promise<void>((resolve) => {
    const tick = setInterval(() => {
      if (!BackgroundService.isRunning()) {
        clearInterval(tick);
        resolve();
      }
    }, 1000);
  });

export async function startKeepalive(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (Platform.Version >= 33) {
    // Thiếu quyền thông báo thì service vẫn chạy, nhưng người đo không thấy dấu hiệu nào là nó đang sống.
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  if (BackgroundService.isRunning()) return;
  await BackgroundService.start(idleUntilStopped, {
    taskName: 'stt-spike',
    taskTitle: 'STT spike đang ghi',
    taskDesc: 'Đang đo nhận diện giọng nói',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    foregroundServiceType: ['microphone'],
  });
}

export async function stopKeepalive(): Promise<void> {
  if (Platform.OS !== 'android' || !BackgroundService.isRunning()) return;
  await BackgroundService.stop();
}
