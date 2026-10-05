import { existsSync } from 'node:fs';
import type { ExpoConfig } from 'expo/config';

/**
 * Thay `app.json`. Lý do duy nhất là plugin `@react-native-google-signin/google-signin`
 * chỉ được thêm vào KHI có `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` — một cây mã đã cài thư
 * viện nhưng chưa cấu hình Google (env rỗng) dựng ra native y hệt trước khi có phase này.
 *
 * Toàn bộ nội dung còn lại giữ nguyên xi từ `app.json` cũ — không được rơi trường nào,
 * xác nhận bằng `npx expo config --type public --json` diff rỗng khi env Google rỗng.
 */
const plugins: ExpoConfig['plugins'] = [
  'expo-router',
  [
    'expo-audio',
    {
      microphonePermission:
        'Meetio cần quyền truy cập microphone để ghi âm cuộc họp và chuyển giọng nói thành văn bản.',
      // Server-mode recognition records with expo-audio, which keeps recording under the screen
      // lock only when its own microphone foreground service is declared.
      enableBackgroundRecording: true,
    },
  ],
  'expo-sharing',
  [
    'expo-speech-recognition',
    {
      microphonePermission:
        'Meetio cần quyền truy cập microphone để ghi âm cuộc họp và chuyển giọng nói thành văn bản.',
      speechRecognitionPermission:
        'Meetio chuyển giọng nói thành văn bản ngay trên điện thoại. Âm thanh không rời khỏi máy.',
      androidSpeechServicePackages: ['com.google.android.googlequicksearchbox', 'com.google.android.as'],
    },
  ],
  'expo-sqlite',
  // Android: foreground service loại `microphone` để ghi tiếp khi app xuống nền / khóa màn hình (US-10).
  './plugins/with-microphone-foreground-service.js',
  [
    'expo-notifications',
    {
      icon: './assets/icon.png',
    },
  ],
  // Android: nhấn giữ icon app → 3 lối tắt (src/navigation/app-shortcuts.ts). Icon là glyph Feather
  // cam `primaryStrong` dựng thành adaptive icon trên nền peach của icon app.
  [
    'expo-quick-actions',
    {
      androidIcons: {
        shortcut_record: { foregroundImage: './assets/shortcuts/shortcut-record.png', backgroundColor: '#FEF3E6' },
        shortcut_ask: { foregroundImage: './assets/shortcuts/shortcut-ask.png', backgroundColor: '#FEF3E6' },
        shortcut_actions: { foregroundImage: './assets/shortcuts/shortcut-actions.png', backgroundColor: '#FEF3E6' },
      },
    },
  ],
  // Android: widget màn hình chính (src/widget/). Cập nhật chủ yếu do app đẩy; 30 phút là mức sàn của hệ thống.
  [
    'react-native-android-widget',
    {
      widgets: [
        {
          name: 'MeetioWidget',
          label: 'Meetio',
          description: 'Ghi cuộc họp một chạm, việc cần làm và cuộc họp gần nhất',
          minWidth: '250dp',
          minHeight: '110dp',
          targetCellWidth: 4,
          targetCellHeight: 2,
          resizeMode: 'horizontal|vertical',
          updatePeriodMillis: 1800000,
          previewImage: './assets/widget-preview.png',
        },
      ],
    },
  ],
];

if (process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME) {
  plugins.push([
    '@react-native-google-signin/google-signin',
    { iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME },
  ]);
}

// Push (US-29/30): Expo push token cần projectId của EAS — lấy bằng `npx eas init`, đặt vào
// EXPO_PUBLIC_EAS_PROJECT_ID ở .env gốc (không phải bí mật). Android còn cần FCM:
// `google-services.json` của Firebase đặt cạnh file này (đã gitignore). Thiếu thứ nào thì
// push tắt có chủ đích và app báo một dòng cảnh báo — không crash.
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const googleServicesFile = existsSync(`${__dirname}/google-services.json`) ? './google-services.json' : undefined;

// `newArchEnabled` được Expo CLI đọc và ghi ra `expo config` (xác nhận qua diff byte-identical
// với app.json cũ), nhưng gói `@expo/config-types` ở bản này chưa khai nó trong `ExpoConfig` —
// ép kiểu thay vì đánh rơi trường để tránh lỗi biên dịch giả.
const config = {
  name: 'Meetio',
  slug: 'meetio',
  scheme: 'meetio',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  plugins,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.tobi-04.meetio',
    // US-10: nhận diện tiếp khi khóa màn hình — iOS chỉ giữ app sống khi audio session còn chạy.
    infoPlist: { UIBackgroundModes: ['audio'] },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#FEF3E6',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    ...(googleServicesFile ? { googleServicesFile } : {}),
    package: 'com.tobi_04.meetio',
    // Hàng đợi transcript (SQLite) chứa nội dung cuộc họp — không cho vào bản sao lưu Google Drive.
    allowBackup: false,
  },
  ...(easProjectId ? { extra: { eas: { projectId: easProjectId } } } : {}),
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
} as ExpoConfig;

export default config;
