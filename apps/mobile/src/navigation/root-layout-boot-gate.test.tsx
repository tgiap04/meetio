import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * Proves the boot gate in `app/_layout.tsx` holds on ALL THREE conditions in
 * parallel (decisions.md §1) and only renders `<Slot/>` once every one of
 * them has cleared. This is the entire anti-flash mechanism: no child route
 * mounts, so `(app)/_layout.tsx` never gets a chance to fire its own
 * redirect and be yanked back. Follows the mocking shape of
 * `app-group-layout.test.tsx` — mock variables must be prefixed `mock` for
 * Jest's out-of-scope check on `jest.mock()` factories.
 *
 * This file must stay OUT of `app/` — see the comment in
 * `app-group-layout.test.tsx` for why (CI job
 * `assert-no-tests-in-expo-router-app-dir`).
 */
const mockSlot = jest.fn((_props: unknown) => null);

jest.mock('expo-router', () => ({
  Slot: (props: unknown) => mockSlot(props),
}));

jest.mock('../store/session.store', () => ({
  useSessionStore: jest.fn(),
}));

jest.mock('../store/preferences.store', () => ({
  usePreferencesStore: jest.fn(),
}));

jest.mock('../hooks/use-hydrate-session', () => ({
  useHydrateSession: jest.fn(),
}));

jest.mock('../hooks/use-hydrate-preferences', () => ({
  useHydratePreferences: jest.fn(),
}));

jest.mock('../query/query-client', () => ({
  queryClient: {},
  wireQueryClientToAppState: jest.fn(() => () => {}),
}));

jest.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { useSessionStore } from '../store/session.store';
import { usePreferencesStore } from '../store/preferences.store';
import RootLayout from '../../app/_layout';

const mockedUseSessionStore = useSessionStore as unknown as jest.Mock;
const mockedUsePreferencesStore = usePreferencesStore as unknown as jest.Mock;

type AuthStatus = 'hydrating' | 'authenticated' | 'unauthenticated';
type PreferencesStatus = 'hydrating' | 'ready';

function setStores(authStatus: AuthStatus, preferencesStatus: PreferencesStatus) {
  mockedUseSessionStore.mockImplementation((selector: (state: { authStatus: AuthStatus }) => unknown) =>
    selector({ authStatus }),
  );
  mockedUsePreferencesStore.mockImplementation(
    (selector: (state: { status: PreferencesStatus }) => unknown) => selector({ status: preferencesStatus }),
  );
}

function renderRootLayout() {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(<RootLayout />);
  });
  return renderer!;
}

describe('root layout boot gate', () => {
  beforeEach(() => {
    mockSlot.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds on splash while the session is still hydrating', () => {
    setStores('hydrating', 'ready');
    const renderer = renderRootLayout();
    act(() => {
      jest.advanceTimersByTime(900);
    });

    expect(mockSlot).not.toHaveBeenCalled();
    expect(() => renderer.root.findByProps({ testID: 'app-splash' })).not.toThrow();
  });

  it('holds on splash while preferences are still hydrating', () => {
    setStores('authenticated', 'hydrating');
    const renderer = renderRootLayout();
    act(() => {
      jest.advanceTimersByTime(900);
    });

    expect(mockSlot).not.toHaveBeenCalled();
    expect(() => renderer.root.findByProps({ testID: 'app-splash' })).not.toThrow();
  });

  it('holds on splash until the 900ms floor elapses, even when both stores are ready', () => {
    setStores('authenticated', 'ready');
    const renderer = renderRootLayout();

    act(() => {
      jest.advanceTimersByTime(899);
    });
    expect(mockSlot).not.toHaveBeenCalled();
    expect(() => renderer.root.findByProps({ testID: 'app-splash' })).not.toThrow();
  });

  it('renders Slot exactly once all three conditions clear', () => {
    setStores('authenticated', 'ready');
    const renderer = renderRootLayout();

    act(() => {
      jest.advanceTimersByTime(900);
    });

    expect(mockSlot).toHaveBeenCalledTimes(1);
    expect(() => renderer.root.findByProps({ testID: 'app-splash' })).toThrow();
  });

  it('does not add the 900ms floor on top of slow hydration', () => {
    setStores('authenticated', 'ready');
    renderRootLayout();

    // Hydration is already 'ready' at mount (simulating hydration that took
    // far longer than 900ms before this component ever rendered); the gate
    // must not wait an ADDITIONAL 900ms beyond the floor started at mount.
    act(() => {
      jest.advanceTimersByTime(900);
    });

    expect(mockSlot).toHaveBeenCalledTimes(1);
  });
});
