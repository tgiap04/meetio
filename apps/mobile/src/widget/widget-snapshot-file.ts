import { File, Paths } from 'expo-file-system';
import { parseWidgetSnapshot, type WidgetSnapshot } from './widget-snapshot';

/**
 * The snapshot lives in app-private document storage: not readable by other apps, and excluded from
 * Google Drive backup by `allowBackup: false` (app.config.ts). It holds no token and no transcript.
 */
const snapshotFile = () => new File(Paths.document, 'widget-snapshot.json');

export async function readWidgetSnapshot(): Promise<WidgetSnapshot> {
  try {
    const file = snapshotFile();
    return parseWidgetSnapshot(file.exists ? await file.text() : null);
  } catch {
    return parseWidgetSnapshot(null);
  }
}

export function writeWidgetSnapshot(snapshot: WidgetSnapshot): void {
  const file = snapshotFile();
  file.create({ overwrite: true });
  file.write(JSON.stringify(snapshot));
}
