import { Platform } from 'react-native';
import BackgroundService from 'react-native-background-actions';
import { startKeepalive, stopKeepalive, updateKeepaliveNotification } from './background-keepalive';
import { notificationForPhase } from './recording-notification-actions';

const service = BackgroundService as unknown as {
  start: jest.Mock;
  updateNotification: jest.Mock;
  isRunning: () => boolean;
};
const originalOS = Platform.OS;

beforeEach(() => {
  Platform.OS = 'android';
  service.start.mockClear();
  service.updateNotification.mockClear();
});
afterEach(async () => {
  await stopKeepalive();
  Platform.OS = originalOS;
});

it('starts the microphone service with the recording buttons', async () => {
  await startKeepalive();
  expect(service.start).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({ foregroundServiceType: ['microphone'], actions: notificationForPhase('recording').actions }),
  );
});

it('redraws the notification only while the service runs', async () => {
  await updateKeepaliveNotification(notificationForPhase('paused'));
  expect(service.updateNotification).not.toHaveBeenCalled();

  await startKeepalive();
  await updateKeepaliveNotification(notificationForPhase('paused'));
  expect(service.updateNotification).toHaveBeenCalledWith(notificationForPhase('paused'));
});
