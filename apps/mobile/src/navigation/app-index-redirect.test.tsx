import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * Proves `app/index.tsx` calls `resolveBootstrapRoute` with the live store
 * values instead of redirecting to a hardcoded route. `Redirect` is mocked to
 * a bare marker so this stays a unit test of the wiring, not a full
 * navigation-stack render — same approach as `app-group-layout.test.tsx`.
 *
 * This file must stay OUT of `app/` — see the note in
 * `app-group-layout.test.tsx` for why (Expo Router route collision + leaked
 * Jest globals in the app bundle).
 */
const mockRedirect = jest.fn((_props: { href: string }) => null);

jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}));

jest.mock('../store/session.store', () => ({
  useSessionStore: jest.fn(),
}));

jest.mock('../store/preferences.store', () => ({
  usePreferencesStore: jest.fn(),
}));

import { useSessionStore } from '../store/session.store';
import { usePreferencesStore } from '../store/preferences.store';
import { LOGIN_ROUTE, MIC_PERMISSION_ROUTE, ONBOARDING_ROUTE, APP_HOME_ROUTE } from './route-guards';
import IndexScreen from '../../app/index';

const mockedUseSessionStore = useSessionStore as unknown as jest.Mock;
const mockedUsePreferencesStore = usePreferencesStore as unknown as jest.Mock;

interface Scenario {
  authStatus: 'hydrating' | 'authenticated' | 'unauthenticated';
  onboardingCompleted: boolean;
  micPromptSeen: boolean;
}

function renderWithState(scenario: Scenario) {
  mockedUseSessionStore.mockImplementation((selector: (state: Scenario) => unknown) =>
    selector(scenario),
  );
  mockedUsePreferencesStore.mockImplementation((selector: (state: Scenario) => unknown) =>
    selector(scenario),
  );
  return act(() => {
    TestRenderer.create(<IndexScreen />);
  });
}

describe('app/index.tsx bootstrap redirect', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('#3 sends an authenticated user with no onboarding to onboarding', () => {
    renderWithState({ authStatus: 'authenticated', onboardingCompleted: false, micPromptSeen: false });

    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: ONBOARDING_ROUTE }));
  });

  it('#5 sends an unauthenticated onboarded user to login', () => {
    renderWithState({ authStatus: 'unauthenticated', onboardingCompleted: true, micPromptSeen: false });

    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: LOGIN_ROUTE }));
  });

  it('#7 sends an authenticated, onboarded user who has not seen the mic prompt to permission', () => {
    renderWithState({ authStatus: 'authenticated', onboardingCompleted: true, micPromptSeen: false });

    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: MIC_PERMISSION_ROUTE }));
  });

  it('#8 sends a fully-settled authenticated user home', () => {
    renderWithState({ authStatus: 'authenticated', onboardingCompleted: true, micPromptSeen: true });

    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: APP_HOME_ROUTE }));
  });
});
