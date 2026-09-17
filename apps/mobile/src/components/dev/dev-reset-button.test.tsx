import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';

/**
 * The escape hatch back to onboarding. Two things matter here: it must not
 * exist in a release build, and it must route off the store flip rather than
 * off the Keychain delete. Follows the `expo-router` mocking pattern from
 * `onboarding-screen.test.tsx`.
 */
const mockReplace = jest.fn();
const mockReset = jest.fn();

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

jest.mock('../../store/preferences.store', () => ({
  usePreferencesStore: { getState: () => ({ reset: mockReset }) },
}));

import { DevResetButton } from './dev-reset-button';
import { ROOT_ROUTE } from '../../navigation/route-guards';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<DevResetButton />);
  });
  return renderer;
}

/** `__DEV__` is declared as a bare global, not a member of `globalThis`. */
function setDevFlag(value: boolean) {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
}

function press(renderer: TestRenderer.ReactTestRenderer) {
  act(() => {
    renderer.root.findByProps({ testID: 'dev-reset-button' }).props.onPress();
  });
}

describe('DevResetButton', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockReplace.mockClear();
    mockReset.mockReset().mockResolvedValue(undefined);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    setDevFlag(true);
  });

  it('renders nothing in a release build', () => {
    // Metro substitutes __DEV__ as a literal and drops the dead branch, so this
    // control cannot ship. Assert the behaviour anyway — the guard is the only
    // thing standing between a debug affordance and production.
    setDevFlag(false);

    expect(render().toJSON()).toBeNull();
  });

  it('renders in a development build', () => {
    expect(render().toJSON()).not.toBeNull();
  });

  it('clears the flags, then hands the destination back to the bootstrap resolver', () => {
    press(render());

    expect(mockReset).toHaveBeenCalledTimes(1);
    // '/' and not '/onboarding': `resolveBootstrapRoute` owns that decision, so
    // adding a future gate stays a change to one pure function.
    expect(mockReplace).toHaveBeenCalledWith(ROOT_ROUTE);
    expect(mockReset.mock.invocationCallOrder[0]).toBeLessThan(mockReplace.mock.invocationCallOrder[0]);
  });

  it('navigates without waiting on the Keychain delete', async () => {
    let settle!: () => void;
    mockReset.mockReturnValue(new Promise<void>((resolve) => {
      settle = resolve;
    }));

    press(render());

    // Routing reads the store, which already flipped — a hung Keychain must not
    // leave the user staring at the screen they just asked to leave.
    expect(mockReplace).toHaveBeenCalledWith(ROOT_ROUTE);
    await act(async () => {
      settle();
    });
  });

  it('warns that the reset will not survive a relaunch when the delete fails', async () => {
    mockReset.mockRejectedValue(new Error('keychain unavailable'));

    press(render());
    await act(async () => {});

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(ROOT_ROUTE);
  });
});
