// Lượt on-device phải chạy khi máy KHÔNG có mạng. Đây là bằng chứng duy nhất đứng được cho NFR-02:
// - iOS không có API cho biết vi-VN có chạy on-device được không (getSupportedLocales trả về cả
//   locale chỉ chạy qua mạng), và khi không hỗ trợ thì thư viện lặng lẽ bỏ cờ
//   requiresOnDeviceRecognition rồi gửi audio lên máy chủ Apple — không lỗi, không log.
// - Offline mà vẫn nhận ra chữ thì audio chắc chắn không rời máy, trên cả hai nền tảng.

const PROBE_URL = 'https://clients3.google.com/generate_204';

export async function isNetworkReachable(timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(PROBE_URL, { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
