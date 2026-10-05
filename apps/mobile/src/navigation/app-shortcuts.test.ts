import { Platform } from 'react-native';
import * as QuickActions from 'expo-quick-actions';
import { APP_SHORTCUTS, registerAppShortcuts } from './app-shortcuts';
import { ACTIONS_ROUTE, ASK_ROUTE, RECORDING_SETUP_ROUTE } from './app-routes';

const quickActions = QuickActions as jest.Mocked<typeof QuickActions>;

describe('app shortcuts', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
    quickActions.setItems.mockClear();
  });

  it('routes the three shortcuts to recording setup, Q&A and the to-do list', () => {
    expect(APP_SHORTCUTS.map((a) => a.params.href)).toEqual([RECORDING_SETUP_ROUTE, ASK_ROUTE, ACTIONS_ROUTE]);
  });

  it('stays within the four shortcuts launchers reliably show', () => {
    expect(APP_SHORTCUTS.length).toBeLessThanOrEqual(4);
  });

  it('registers them on Android', async () => {
    Platform.OS = 'android';
    await registerAppShortcuts();
    expect(quickActions.setItems).toHaveBeenCalledWith(APP_SHORTCUTS);
  });

  it('does nothing on iOS', async () => {
    Platform.OS = 'ios';
    await registerAppShortcuts();
    expect(quickActions.setItems).not.toHaveBeenCalled();
  });

  it('swallows a launcher refusal', async () => {
    Platform.OS = 'android';
    quickActions.setItems.mockRejectedValueOnce(new Error('limit'));
    await expect(registerAppShortcuts()).resolves.toBeUndefined();
  });
});
