import { Platform } from 'react-native';
import * as QuickActions from 'expo-quick-actions';
import type { RouterAction } from 'expo-quick-actions/router';
import { ACTIONS_ROUTE, ASK_ROUTE, RECORDING_SETUP_ROUTE } from './app-routes';

/**
 * Launcher shortcuts (long-press the app icon, Android ShortcutManager). `icon` names the adaptive
 * icons the expo-quick-actions plugin generates from `assets/shortcuts/` (app.config.ts).
 * Routing goes through `useQuickActionRouting` in the `(app)` layout, so the auth guard and the app
 * lock both apply to a shortcut exactly as to a tap inside the app.
 */
export const APP_SHORTCUTS: RouterAction[] = [
  { id: 'record', title: 'Ghi cuộc họp mới', icon: 'shortcut_record', params: { href: RECORDING_SETUP_ROUTE } },
  { id: 'ask', title: 'Hỏi AI', icon: 'shortcut_ask', params: { href: ASK_ROUTE } },
  { id: 'actions', title: 'Việc cần làm', icon: 'shortcut_actions', params: { href: ACTIONS_ROUTE } },
];

/** Android only (iOS would need its own icon set); a failure just means no shortcuts, never a crash. */
export async function registerAppShortcuts(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await QuickActions.setItems(APP_SHORTCUTS);
  } catch {
    // Launcher refused (e.g. shortcut limit) — the app works the same without them.
  }
}
