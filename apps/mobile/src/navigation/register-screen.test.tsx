import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * Exercises `app/(auth)/register.tsx` as a thin wiring layer, mirroring
 * `login-screen.test.tsx`. `RegisterForm` (phase 07) has no `DevResetButton`,
 * so nothing else needs mocking beyond the two hooks and `expo-router`.
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
  useRegisterMutation: () => ({
    mutate: (...args: unknown[]) => mockMutate(...args),
    ...mockMutationState,
  }),
}));

const mockGoogleStart = jest.fn();
let mockGoogleState = { isPending: false, errorMessage: null as string | null };
jest.mock('../hooks/use-google-sign-in', () => ({
  useGoogleSignIn: () => ({ start: mockGoogleStart, ...mockGoogleState }),
}));

import RegisterScreen from '../../app/(auth)/register';

function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RegisterScreen />);
  });
  return renderer;
}

/** See `login-form.test.tsx` for why this filter is needed on a memoised `Pressable`. */
function pressableAt(renderer: TestRenderer.ReactTestRenderer, testID: string) {
  const matches = renderer.root.findAllByProps({ testID }).filter((n) => 'onPress' in n.props);
  const el = matches[matches.length - 1];
  expect(el).toBeTruthy();
  return el;
}

describe('(auth)/register route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutationState = { isPending: false, isError: false, error: null };
    mockGoogleState = { isPending: false, errorMessage: null };
  });

  it('RegisterScreen gọi mutate với đủ display_name/email/password', () => {
    const renderer = renderScreen();
    const nameInput = renderer.root.findByProps({ testID: 'register-display-name-input' });
    const emailInput = renderer.root.findByProps({ testID: 'register-email-input' });
    const passwordInput = renderer.root.findByProps({ testID: 'register-password-input' });

    act(() => nameInput.props.onChangeText('Nguyễn Văn A'));
    act(() => emailInput.props.onChangeText('a@b.com'));
    act(() => passwordInput.props.onChangeText('secret123'));
    pressableAt(renderer, 'register-submit-button').props.onPress();

    expect(mockMutate).toHaveBeenCalledWith({
      display_name: 'Nguyễn Văn A',
      email: 'a@b.com',
      password: 'secret123',
    });
  });

  it('RegisterScreen cắm useGoogleSignIn', () => {
    const renderer = renderScreen();
    pressableAt(renderer, 'register-google-button').props.onPress();
    expect(mockGoogleStart).toHaveBeenCalledTimes(1);
  });

  it('truyền lỗi Google xuống googleErrorMessage, không lẫn vào errorMessage', () => {
    mockGoogleState = { isPending: false, errorMessage: 'Không thể xác thực với Google' };
    const renderer = renderScreen();

    const googleError = renderer.root
      .findAllByProps({ testID: 'register-google-error' })
      .find((n) => typeof n.type === 'string');
    expect(googleError?.props.children).toBe('Không thể xác thực với Google');
    expect(renderer.root.findAllByProps({ testID: 'register-error' })).toHaveLength(0);
  });

  it('không gọi router.replace sau khi đăng ký thành công — bootstrap-route quyết định đích', () => {
    const renderer = renderScreen();
    pressableAt(renderer, 'register-submit-button').props.onPress();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates to login with router.push, never replace', () => {
    const renderer = renderScreen();
    pressableAt(renderer, 'register-login-link').props.onPress();
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
