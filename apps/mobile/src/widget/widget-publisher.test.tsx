import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { MEETIO_WIDGET_NAME, publishWidgetSnapshot } from './widget-publisher';
import { writeWidgetSnapshot } from './widget-snapshot-file';
import { SIGNED_OUT_SNAPSHOT } from './widget-snapshot';

jest.mock('./widget-snapshot-file', () => ({ writeWidgetSnapshot: jest.fn() }));
const write = writeWidgetSnapshot as jest.Mock;
const update = requestWidgetUpdate as jest.Mock;
const originalOS = Platform.OS;

afterEach(() => {
  Platform.OS = originalOS;
  write.mockReset();
  update.mockClear();
});

it('stores the snapshot and redraws the placed widgets on Android', async () => {
  Platform.OS = 'android';
  await publishWidgetSnapshot(SIGNED_OUT_SNAPSHOT);
  expect(write).toHaveBeenCalledWith(SIGNED_OUT_SNAPSHOT);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ widgetName: MEETIO_WIDGET_NAME }));
  const element = update.mock.calls[0][0].renderWidget();
  expect(element.props.snapshot).toBe(SIGNED_OUT_SNAPSHOT);
});

it('is a no-op on iOS', async () => {
  Platform.OS = 'ios';
  await publishWidgetSnapshot(SIGNED_OUT_SNAPSHOT);
  expect(write).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

it('never throws when storage or the launcher fails', async () => {
  Platform.OS = 'android';
  write.mockImplementationOnce(() => {
    throw new Error('disk full');
  });
  await expect(publishWidgetSnapshot(SIGNED_OUT_SNAPSHOT)).resolves.toBeUndefined();
});
