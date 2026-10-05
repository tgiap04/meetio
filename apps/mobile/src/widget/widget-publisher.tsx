import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { MeetioWidget } from './meetio-widget';
import { writeWidgetSnapshot } from './widget-snapshot-file';
import type { WidgetSnapshot } from './widget-snapshot';

export const MEETIO_WIDGET_NAME = 'MeetioWidget';

/**
 * Stores the snapshot (for the next launcher-driven redraw) and redraws every placed widget now.
 * Android only. Never throws — a widget that fails to refresh must not break the screen that asked.
 */
export async function publishWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    writeWidgetSnapshot(snapshot);
    await requestWidgetUpdate({
      widgetName: MEETIO_WIDGET_NAME,
      renderWidget: () => <MeetioWidget snapshot={snapshot} />,
    });
  } catch {
    // No widget placed, or the launcher refused the update — the stored snapshot still applies next draw.
  }
}
