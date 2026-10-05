import { PermissionsAndroid, Platform } from 'react-native';
import BackgroundService from 'react-native-background-actions';
import { notificationForPhase, type RecordingNotificationContent } from './recording-notification-actions';

/**
 * Keeps recording alive with the screen off or another app open (US-10).
 * - Android: a foreground service of type `microphone` (declared by
 *   plugins/with-microphone-foreground-service.js) with a persistent notification; tapping it
 *   reopens the recording screen. It must start while the app is still in the foreground —
 *   Android 14+ refuses to start a microphone service from the background.
 * - iOS: `UIBackgroundModes: audio` (app.config.ts). The app lives while the audio session runs;
 *   if iOS still cuts the session, the restart loop brings it back and marks the gap.
 * The service task itself does nothing — recognition runs on the JS thread; the service only
 * keeps the process at foreground priority. Pattern measured in the Phase 00 spike.
 * The notification carries Pause/Resume/End buttons (recording-notification-actions.ts) through a
 * local patch of react-native-background-actions (.yarn/patches).
 */
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
  if (Platform.OS !== 'android' || BackgroundService.isRunning()) return;
  if (Number(Platform.Version) >= 33) {
    // Without it the service still runs, but the user sees no sign that recording continues.
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  await BackgroundService.start(idleUntilStopped, {
    taskName: 'meetio-recording',
    taskTitle: 'Meetio đang ghi cuộc họp',
    // Started only by `listen()`, i.e. while recording.
    ...notificationForPhase('recording'),
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    linkingURI: 'meetio://recording-live',
    foregroundServiceType: ['microphone'],
  });
}

export async function stopKeepalive(): Promise<void> {
  if (Platform.OS !== 'android' || !BackgroundService.isRunning()) return;
  await BackgroundService.stop();
}

/** Redraws the running service's notification (text + buttons). No-op when no service runs. */
export async function updateKeepaliveNotification(content: RecordingNotificationContent): Promise<void> {
  if (Platform.OS !== 'android' || !BackgroundService.isRunning()) return;
  await BackgroundService.updateNotification(content);
}
