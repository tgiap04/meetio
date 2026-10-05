import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { widgetTaskHandler } from './widget-task-handler';
import { readWidgetSnapshot } from './widget-snapshot-file';
import { SIGNED_OUT_SNAPSHOT } from './widget-snapshot';

jest.mock('./widget-snapshot-file', () => ({ readWidgetSnapshot: jest.fn() }));
const read = readWidgetSnapshot as jest.Mock;

function props(widgetAction: WidgetTaskHandlerProps['widgetAction']) {
  return {
    widgetAction,
    renderWidget: jest.fn(),
    widgetInfo: { widgetName: 'MeetioWidget', widgetId: 1, width: 1, height: 1, screenInfo: {} },
  } as unknown as WidgetTaskHandlerProps & { renderWidget: jest.Mock };
}

beforeEach(() => read.mockResolvedValue(SIGNED_OUT_SNAPSHOT));

it.each(['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'] as const)('draws from the stored snapshot on %s', async (action) => {
  const p = props(action);
  await widgetTaskHandler(p);
  expect(read).toHaveBeenCalled();
  expect(p.renderWidget).toHaveBeenCalledTimes(1);
  expect(p.renderWidget.mock.calls[0][0].props.snapshot).toBe(SIGNED_OUT_SNAPSHOT);
});

it.each(['WIDGET_DELETED', 'WIDGET_CLICK'] as const)('does nothing on %s', async (action) => {
  read.mockClear();
  const p = props(action);
  await widgetTaskHandler(p);
  expect(read).not.toHaveBeenCalled();
  expect(p.renderWidget).not.toHaveBeenCalled();
});
