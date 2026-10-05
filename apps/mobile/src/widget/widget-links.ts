/**
 * Deep links the widget opens. `OPEN_URI` is handled natively by the widget library — no JS runs
 * on click — and expo-router resolves the path, so the `(app)` auth guard and the app lock apply
 * exactly as they do inside the app.
 */
export const WIDGET_LINKS = {
  home: 'meetio://',
  record: 'meetio://recording-setup',
  recordingLive: 'meetio://recording-live',
  actions: 'meetio://actions',
  meeting: (id: string) => `meetio://meeting-detail?id=${encodeURIComponent(id)}`,
} as const;
