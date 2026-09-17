import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('../storage/device-preferences', () => ({
  readDevicePreferences: jest.fn(),
}));

import { readDevicePreferences } from '../storage/device-preferences';
import { usePreferencesStore } from '../store/preferences.store';
import { useHydratePreferences } from './use-hydrate-preferences';

const mockedRead = readDevicePreferences as jest.Mock;

function HydrateProbe() {
  useHydratePreferences();
  return null;
}

describe('useHydratePreferences', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ status: 'hydrating', onboardingCompleted: false, micPromptSeen: false });
    mockedRead.mockReset();
  });

  it('moves status to ready with the read values once resolved', async () => {
    mockedRead.mockResolvedValue({ onboardingCompleted: true, micPromptSeen: false });

    await act(async () => {
      TestRenderer.create(<HydrateProbe />);
    });

    expect(usePreferencesStore.getState()).toMatchObject({
      status: 'ready',
      onboardingCompleted: true,
      micPromptSeen: false,
    });
  });

  it('moves status to ready with both flags false when the read rejects', async () => {
    mockedRead.mockRejectedValue(new Error('keychain unavailable'));

    await act(async () => {
      TestRenderer.create(<HydrateProbe />);
    });

    expect(usePreferencesStore.getState()).toMatchObject({
      status: 'ready',
      onboardingCompleted: false,
      micPromptSeen: false,
    });
  });

  it('does not update state after unmounting before the read resolves', async () => {
    let resolveRead: (value: { onboardingCompleted: boolean; micPromptSeen: boolean }) => void = () => {};
    mockedRead.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<HydrateProbe />);
    });

    act(() => {
      renderer.unmount();
    });

    await act(async () => {
      resolveRead({ onboardingCompleted: true, micPromptSeen: true });
      await Promise.resolve();
    });

    expect(usePreferencesStore.getState().status).toBe('hydrating');
  });
});
