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
];

if (process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME) {
  plugins.push([
    '@react-native-google-signin/google-signin',
    { iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME },
  ]);
}

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
    package: 'com.tobi_04.meetio',
    // Hàng đợi transcript (SQLite) chứa nội dung cuộc họp — không cho vào bản sao lưu Google Drive.
    allowBackup: false,
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
} as ExpoConfig;

export default config;
