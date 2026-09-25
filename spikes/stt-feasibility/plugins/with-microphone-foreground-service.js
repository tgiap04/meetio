// Khai báo foreground service của react-native-background-actions với loại `microphone`.
// Android 14+ bắt buộc mọi foreground service khai báo loại, và loại `microphone` cần quyền riêng;
// thiếu thì service bị hệ thống giết ngay khi app xuống nền — đúng chế độ spike cần đo.
const { AndroidConfig, withAndroidManifest, withPlugins } = require('expo/config-plugins');

const SERVICE = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

const withServiceType = (config) =>
  withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app.service = (app.service ?? []).filter((s) => s.$['android:name'] !== SERVICE);
    app.service.push({
      $: {
        'android:name': SERVICE,
        'android:foregroundServiceType': 'microphone',
        'android:exported': 'false',
      },
    });
    return config;
  });

module.exports = (config) =>
  withPlugins(config, [
    [
      AndroidConfig.Permissions.withPermissions,
      [
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MICROPHONE',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.WAKE_LOCK',
      ],
    ],
    withServiceType,
  ]);
