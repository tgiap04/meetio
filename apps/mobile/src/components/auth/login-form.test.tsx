import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * `LoginForm` renders the real `DevResetButton` (phase 06 keeps it mounted —
 * see the component's JSDoc). That component imports `expo-router`, whose
 * `standard-navigation` submodule ships un-transpiled ESM that this Jest
 * config cannot parse, and it reads `usePreferencesStore.getState()` at press
 * time. Mocked here exactly as `dev-reset-button.test.tsx` mocks them — this
 * file never presses the button, so the mocks only exist to let the real tree
 * mount, not to fake any behaviour this component owns.
 */
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('../../store/preferences.store', () => ({
  usePreferencesStore: { getState: () => ({ reset: jest.fn().mockResolvedValue(undefined) }) },
}));

import { LoginForm, type LoginFormProps } from './login-form';
import { colors } from '../../theme/colors';

function renderSync(element: ReactElement): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

/** Only the HOST node has resolved styles — above it `style` may still be a function. */
function hostWith(renderer: TestRenderer.ReactTestRenderer, props: Record<string, unknown>) {
  const [host] = renderer.root.findAllByProps(props).filter((n) => typeof n.type === 'string');
  expect(host).toBeTruthy();
  return host;
}

/**
 * `Pressable` is `React.memo(Pressable)`, so a `testID` set on it echoes across
 * several layers: the owning component's own fiber (`PrimaryButton`,
 * `GoogleSignInButton`), the memoised `Pressable` fiber itself, an internal
 * wrapper `View`, and the host view. Only the `Pressable` fiber still carries
 * `onPress`/`disabled` as live props the way this component set them (the host
 * converts `disabled` into responder handlers instead) — it is always the last
 * match with `onPress`, since `findAllByProps` walks parent-before-child and
 * the owning component (if any) always wraps it.
 */
function pressableAt(renderer: TestRenderer.ReactTestRenderer, testID: string) {
  const matches = renderer.root.findAllByProps({ testID }).filter((n) => 'onPress' in n.props);
  const el = matches[matches.length - 1];
  expect(el).toBeTruthy();
  return el;
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return (style as Record<string, unknown>) ?? {};
}

const baseProps: LoginFormProps = {
  email: '',
  password: '',
  onChangeEmail: jest.fn(),
  onChangePassword: jest.fn(),
  onSubmit: jest.fn(),
  submitting: false,
  errorMessage: null,
  onGooglePress: jest.fn(),
  googlePending: false,
  googleErrorMessage: null,
  onNavigateToRegister: jest.fn(),
};

function withProps(overrides: Partial<LoginFormProps>): LoginFormProps {
  return { ...baseProps, ...overrides };
}

describe('LoginForm', () => {
  it('calls onSubmit when the primary button is pressed', () => {
    const onSubmit = jest.fn();
    const renderer = renderSync(<LoginForm {...withProps({ onSubmit })} />);
    pressableAt(renderer, 'login-submit-button').props.onPress();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onGooglePress when the Google button is pressed', () => {
    const onGooglePress = jest.fn();
    const renderer = renderSync(<LoginForm {...withProps({ onGooglePress })} />);
    pressableAt(renderer, 'login-google-button').props.onPress();
    expect(onGooglePress).toHaveBeenCalledTimes(1);
  });

  it('calls onNavigateToRegister when the footer link is pressed', () => {
    const onNavigateToRegister = jest.fn();
    const renderer = renderSync(<LoginForm {...withProps({ onNavigateToRegister })} />);
    pressableAt(renderer, 'login-register-link').props.onPress();
    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);
  });

  it('locks the Google button while the password flow is submitting', () => {
    const renderer = renderSync(<LoginForm {...withProps({ submitting: true })} />);
    const google = pressableAt(renderer, 'login-google-button');
    expect(google.props.disabled).toBe(true);
    expect(google.props.accessibilityState).toEqual({ disabled: true, busy: false });
  });

  it('locks the primary button while the Google flow is pending', () => {
    const renderer = renderSync(<LoginForm {...withProps({ googlePending: true })} />);
    const submit = pressableAt(renderer, 'login-submit-button');
    expect(submit.props.disabled).toBe(true);
    expect(submit.props.accessibilityState).toEqual({ disabled: true });
  });

  it('keeps the Google error on its own line, never merged with the password error', () => {
    const renderer = renderSync(
      <LoginForm
        {...withProps({
          errorMessage: 'Email hoặc mật khẩu không đúng',
          googleErrorMessage: 'Không thể xác thực với Google',
        })}
      />,
    );
    const passwordError = hostWith(renderer, { testID: 'login-error' });
    const googleError = hostWith(renderer, { testID: 'login-google-error' });
    expect(passwordError.props.children).toBe('Email hoặc mật khẩu không đúng');
    expect(googleError.props.children).toBe('Không thể xác thực với Google');
    expect(passwordError).not.toBe(googleError);
  });

  it('renders neither error line when both are null', () => {
    const renderer = renderSync(<LoginForm {...withProps({})} />);
    expect(renderer.root.findAllByProps({ testID: 'login-error' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'login-google-error' })).toHaveLength(0);
  });

  it('keeps DevResetButton mounted — the only route back to onboarding on iOS', () => {
    const renderer = renderSync(<LoginForm {...withProps({})} />);
    expect(renderer.root.findByProps({ testID: 'dev-reset-button' })).toBeTruthy();
  });

  it('pays the contrast debt on the action word only, leaving the question muted', () => {
    const renderer = renderSync(<LoginForm {...withProps({})} />);
    const question = hostWith(renderer, { testID: 'login-register-link-label' });
    const action = hostWith(renderer, { testID: 'login-register-link-label-strong' });
    expect(flatten(action.props.style).color).toBe(colors.primaryStrong);
    expect(flatten(question.props.style).color).not.toBe(colors.primaryStrong);
    expect(flatten(question.props.style).color).not.toBe(colors.primary);
  });

  it('wires the controlled email and password fields with their platform hints', () => {
    const onChangeEmail = jest.fn();
    const onChangePassword = jest.fn();
    const onSubmit = jest.fn();
    const renderer = renderSync(
      <LoginForm {...withProps({ email: 'a@b.com', password: 'secret', onChangeEmail, onChangePassword, onSubmit })} />,
    );

    const emailInput = hostWith(renderer, { testID: 'login-email-input' });
    expect(emailInput.props.value).toBe('a@b.com');
    expect(emailInput.props.autoCapitalize).toBe('none');
    expect(emailInput.props.keyboardType).toBe('email-address');
    expect(emailInput.props.autoComplete).toBe('email');
    emailInput.props.onChangeText('next@email.com');
    expect(onChangeEmail).toHaveBeenCalledWith('next@email.com');

    const passwordInput = hostWith(renderer, { testID: 'login-password-input' });
    expect(passwordInput.props.value).toBe('secret');
    expect(passwordInput.props.secureTextEntry).toBe(true);
    expect(passwordInput.props.autoComplete).toBe('current-password');
    expect(passwordInput.props.returnKeyType).toBe('go');
    passwordInput.props.onSubmitEditing();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

});

describe('login-form.tsx, as source', () => {
  const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');

  /**
   * Acceptance criterion #9, runnable in CI rather than by hand: this component
   * stays independent of routing, global state, the query client, the native
   * Google module, and the API layer. Held as prefixes on purpose — the phase
   * states the criterion as a `grep -E` over this whole directory, so full
   * package names here would trip its own command. A prefix is strictly more
   * sensitive than the full name, so nothing is lost.
   */
  const FORBIDDEN = ['expo-rout', 'zustan', '@tanstac', 'google-signi', 'api/'];

  it.each(FORBIDDEN)('pulls in nothing matching forbidden fragment %s', (fragment) => {
    expect(read('login-form.tsx')).not.toContain(fragment);
  });

  it.each(['login-form.tsx', 'login-form.test.tsx'])('%s stays under the repo\'s 200-line ceiling', (name) => {
    expect(read(name).split('\n').length).toBeLessThan(200);
  });
});
