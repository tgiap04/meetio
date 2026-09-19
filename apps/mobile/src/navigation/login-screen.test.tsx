import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * Exercises `app/(auth)/login.tsx` as a thin wiring layer: it renders the
 * real `LoginForm` (phase 06) plus the real `DevResetButton` it mounts, but
 * mocks everything that actually reaches the network or native modules —
 * `useLoginMutation` and `useGoogleSignIn` — the same way
 * `permission-screen.test.tsx` mocks its screen's dependencies. `expo-router`
 * is mocked to bare `jest.fn()`s per `onboarding-screen.test.tsx`'s pattern;
 * this file stays out of `app/` for the same CI reason documented there
 * (`assert-no-tests-in-expo-router-app-dir`).
 */
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

const mockMutate = jest.fn();
let mockMutationState = { isPending: false, isError: false, error: null as unknown };
jest.mock('../hooks/use-auth-mutations', () => ({
  useLoginMutation: () => ({ mutate: (...args: unknown[]) => mockMutate(...args), ...mockMutationState }),
}));

const mockGoogleStart = jest.fn();
let mockGoogleState = { isPending: false, errorMessage: null as string | null };
jest.mock('../hooks/use-google-sign-in', () => ({
  useGoogleSignIn: () => ({ start: mockGoogleStart, ...mockGoogleState }),
}));

const mockReset = jest.fn().mockResolvedValue(undefined);
jest.mock('../store/preferences.store', () => ({
  usePreferencesStore: { getState: () => ({ reset: mockReset }) },
}));

import LoginScreen from '../../app/(auth)/login';

function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LoginScreen />);
  });
  return renderer;
}

/** See `login-form.test.tsx`: `Pressable` is memoised, so testID echoes onto
 * several fibers. Only the one still carrying `onPress` as a live prop is the
 * one the component wired, and it is always the last such match. */
function pressableAt(renderer: TestRenderer.ReactTestRenderer, testID: string) {
  const matches = renderer.root.findAllByProps({ testID }).filter((n) => 'onPress' in n.props);
  const el = matches[matches.length - 1];
  expect(el).toBeTruthy();
  return el;
}

describe('(auth)/login route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutationState = { isPending: false, isError: false, error: null };
    mockGoogleState = { isPending: false, errorMessage: null };
  });

  it('wires the controlled email/password fields into useLoginMutation on submit', () => {
    const renderer = renderScreen();
    const emailInput = renderer.root.findByProps({ testID: 'login-email-input' });
    const passwordInput = renderer.root.findByProps({ testID: 'login-password-input' });

    act(() => emailInput.props.onChangeText('a@b.com'));
    act(() => passwordInput.props.onChangeText('secret123'));
    pressableAt(renderer, 'login-submit-button').props.onPress();

    expect(mockMutate).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret123' });
  });

  it('cắm useGoogleSignIn().start vào onGooglePress của LoginForm', () => {
    const renderer = renderScreen();
    pressableAt(renderer, 'login-google-button').props.onPress();
    expect(mockGoogleStart).toHaveBeenCalledTimes(1);
  });

  it('truyền lỗi Google xuống googleErrorMessage, không lẫn vào errorMessage', () => {
    mockGoogleState = { isPending: false, errorMessage: 'Không thể xác thực với Google' };
    const renderer = renderScreen();

    const googleError = renderer.root
      .findAllByProps({ testID: 'login-google-error' })
      .find((n) => typeof n.type === 'string');
    expect(googleError?.props.children).toBe('Không thể xác thực với Google');
    expect(renderer.root.findAllByProps({ testID: 'login-error' })).toHaveLength(0);
  });

  it('không gọi router.replace sau khi đăng nhập thành công — bootstrap-route quyết định đích, không phải route này', () => {
    const renderer = renderScreen();
    pressableAt(renderer, 'login-submit-button').props.onPress();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates to register with router.push, never replace', () => {
    const renderer = renderScreen();
    pressableAt(renderer, 'login-register-link').props.onPress();
    expect(mockPush).toHaveBeenCalledWith('/(auth)/register');
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
