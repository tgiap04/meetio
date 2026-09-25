// Máy này nhận diện tiếng Việt trên thiết bị được không? Đây tự nó đã là một kết quả của spike:
// nếu không, lượt đo "on-device" không chạy được và NFR-02 trượt ngay trên máy đó.

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { RECOGNITION_LANG } from './run-config';

export type DeviceCapabilities = {
  device: string;
  os: string;
  recognitionAvailable: boolean;
  onDeviceSupported: boolean;
  // Điều kiện cần (chưa đủ — xem network-probe.ts) để cờ on-device thực sự được áp:
  // Android < 13: thư viện chỉ gửi EXTRA_PREFER_OFFLINE, một gợi ý service có quyền bỏ qua;
  //   continuous cũng không chạy dưới 13.
  // iOS: thư viện chỉ đặt requiresOnDeviceRecognition khi supportsOnDeviceRecognition — và kiểm
  //   tra đó theo locale mặc định của máy, không phải vi-VN.
  onDeviceEnforced: boolean;
  viSupported: boolean;
  // null trên iOS: không có API nào trả lời được — chỉ lượt đo offline mới trả lời.
  viInstalledOnDevice: boolean | null;
  installedLocales: string[];
  defaultService: string | null;
  services: string[];
};

const matchesVi = (locale: string) =>
  locale.replace('_', '-').toLowerCase() === RECOGNITION_LANG.toLowerCase();

export async function readDeviceCapabilities(): Promise<DeviceCapabilities> {
  const android = Platform.OS === 'android';
  let locales: string[] = [];
  let installedLocales: string[] = [];
  try {
    ({ locales, installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({}));
  } catch (err) {
    // Android 12 trở xuống không liệt kê được locale — ghi rõ là không biết, đừng đoán là có.
    console.warn('[spike] getSupportedLocales thất bại', err);
  }
  const onDeviceSupported = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  return {
    device: `${Device.manufacturer ?? ''} ${Device.modelName ?? 'unknown'}`.trim(),
    os: `${Platform.OS} ${Device.osVersion ?? '?'}`,
    recognitionAvailable: ExpoSpeechRecognitionModule.isRecognitionAvailable(),
    onDeviceSupported,
    onDeviceEnforced: android ? Number(Platform.Version) >= 33 : onDeviceSupported,
    viSupported: locales.some(matchesVi),
    // iOS trả installedLocales = locales (mọi locale, kể cả chỉ chạy qua mạng) — vô nghĩa ở đây.
    viInstalledOnDevice: android ? installedLocales.some(matchesVi) : null,
    installedLocales,
    defaultService: android
      ? ExpoSpeechRecognitionModule.getDefaultRecognitionService().packageName
      : null,
    services: android ? ExpoSpeechRecognitionModule.getSpeechRecognitionServices() : [],
  };
}

export async function requestVietnameseOfflineModel(): Promise<string> {
  const result = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
    locale: RECOGNITION_LANG,
  });
  return `${result.status}: ${result.message}`;
}
