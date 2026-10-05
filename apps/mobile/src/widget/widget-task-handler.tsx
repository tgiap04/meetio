import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { MeetioWidget } from './meetio-widget';
import { readWidgetSnapshot } from './widget-snapshot-file';

/**
 * Headless entry for launcher events (registered in index.ts). Every click is `OPEN_URI`, handled
 * natively, so `WIDGET_CLICK` never needs JS; only (re)draw events render from the stored snapshot.
 */
export async function widgetTaskHandler({ widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  renderWidget(<MeetioWidget snapshot={await readWidgetSnapshot()} />);
}
