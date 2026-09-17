import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * Exercises `app/(app)/permission.tsx` without touching native code. Mirrors
 * `app-group-layout.test.tsx`'s approach: mock `expo-router` and the store,
 * plus (specific to this screen) the whole `microphone-permission` wrapper —
 * that file imports `expo-audio` at module scope, which `jest-expo` cannot
 * usably auto-mock (see `microphone-permission.test.ts`), so a real import
 * here would crash the same way. Mock variables must be prefixed with `mock`
 * (case-insensitive) for Jest's out-of-scope check on `jest.mock()` factories.
 */
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

const mockRead = jest.fn();
const mockRequest = jest.fn();
const mockOpenAppSettings = jest.fn();
jest.mock('../permissions/microphone-permission', () => ({
  readMicrophonePermission: (...args: unknown[]) => mockRead(...args),
  requestMicrophonePermission: (...args: unknown[]) => mockRequest(...args),
  openAppSettings: (...args: unknown[]) => mockOpenAppSettings(...args),
  resolveMicPermissionView: (snapshot: { granted: boolean; canAskAgain: boolean }) =>
    snapshot.granted ? 'granted' : snapshot.canAskAgain ? 'ask' : 'blocked',
}));

const mockMarkMicPromptSeen = jest.fn();
jest.mock('../store/preferences.store', () => ({
  usePreferencesStore: jest.fn(),
}));

import { usePreferencesStore } from '../store/preferences.store';
import PermissionScreen from '../../app/(app)/permission';

const mockedUsePreferencesStore = usePreferencesStore as unknown as jest.Mock;

async function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<PermissionScreen />);
  });
  return renderer;
}

function primaryButton(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ testID: 'permission-primary-button' });
}

async function pressPrimary(renderer: TestRenderer.ReactTestRenderer) {
  await act(async () => {
    await primaryButton(renderer).props.onPress();
  });
}

describe('(app)/permission screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUsePreferencesStore.mockImplementation(
      (selector: (state: { markMicPromptSeen: () => void }) => unknown) =>
        selector({ markMicPromptSeen: mockMarkMicPromptSeen }),
    );
  });

  it('#1 already granted: flags seen and replaces to "/" without ever requesting', async () => {
    mockRead.mockResolvedValue({ granted: true, canAskAgain: true });

    await renderScreen();

    expect(mockMarkMicPromptSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('#2 ask -> primary press -> granted: requests once, then flags + replaces', async () => {
    mockRead.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequest.mockResolvedValue({ granted: true, canAskAgain: true });
    const renderer = await renderScreen();

    await pressPrimary(renderer);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockMarkMicPromptSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('#3 ask -> primary press -> blocked (iOS first denial): no replace, label swaps to "Mở Cài đặt"', async () => {
    mockRead.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequest.mockResolvedValue({ granted: false, canAskAgain: false });
    const renderer = await renderScreen();

    await pressPrimary(renderer);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(primaryButton(renderer).props.label).toBe('Mở Cài đặt');
  });

  it('#4 blocked on mount -> primary press opens Settings, never re-requests, then flags + replaces', async () => {
    mockRead.mockResolvedValue({ granted: false, canAskAgain: false });
    mockOpenAppSettings.mockResolvedValue(undefined);
    const renderer = await renderScreen();

    await pressPrimary(renderer);

    expect(mockOpenAppSettings).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockMarkMicPromptSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('#5 ask -> Android first denial stays "ask", pressing again requests a second time', async () => {
    mockRead.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequest.mockResolvedValue({ granted: false, canAskAgain: true });
    const renderer = await renderScreen();

    await pressPrimary(renderer);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(primaryButton(renderer).props.label).toBe('Cho phép');

    await pressPrimary(renderer);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('#6 "Không, để sau" flags seen and replaces to "/" without ever requesting', async () => {
    mockRead.mockResolvedValue({ granted: false, canAskAgain: true });
    const renderer = await renderScreen();

    await act(async () => {
      renderer.root.findByProps({ testID: 'permission-defer-link' }).props.onPress();
    });

    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockMarkMicPromptSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('#7 the back chevron behaves identically to "Không, để sau"', async () => {
    mockRead.mockResolvedValue({ granted: false, canAskAgain: true });
    const renderer = await renderScreen();

    const back = renderer.root.findByProps({ testID: 'permission-back-button' });
    expect(back.props.accessibilityRole).toBe('button');
    expect(back.props.accessibilityLabel).toBe('Bỏ qua, để sau');

    await act(async () => {
      back.props.onPress();
    });

    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockMarkMicPromptSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
