import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { RegisterForm, type RegisterFormProps } from './register-form';
import { colors } from '../../theme/colors';

function renderSync(element: ReactElement): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

/** `Pressable` is `React.memo(Pressable)`; react-test-renderer flattens the memo
 *  wrapper, so `findByType(Pressable)` never matches. Only the host node carries
 *  resolved styles, only the composite carries `disabled` — one helper each. */
const pressableHosts = (r: TestRenderer.ReactTestRenderer, props: Record<string, unknown>) =>
  r.root.findAllByProps(props).filter((n) => typeof n.type === 'string');
const pressableElement = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAllByProps({ testID })[0];

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return (style as Record<string, unknown>) ?? {};
}

function baseProps(overrides: Partial<RegisterFormProps> = {}): RegisterFormProps {
  return {
    displayName: '',
    email: '',
    password: '',
    onChangeDisplayName: jest.fn(),
    onChangeEmail: jest.fn(),
    onChangePassword: jest.fn(),
    onSubmit: jest.fn(),
    submitting: false,
    errorMessage: null,
    onGooglePress: jest.fn(),
    googlePending: false,
    googleErrorMessage: null,
    onNavigateToLogin: jest.fn(),
    ...overrides,
  };
}

describe('RegisterForm', () => {
  it('wires displayName, email and password to their own change handlers', () => {
    const props = baseProps();
    const renderer = renderSync(<RegisterForm {...props} />);
    const inputs = renderer.root.findAllByType(TextInput);

    act(() => inputs[0].props.onChangeText('Nguyễn Văn A'));
    act(() => inputs[1].props.onChangeText('a@meetio.app'));
    act(() => inputs[2].props.onChangeText('matkhaudai8'));

    expect(props.onChangeDisplayName).toHaveBeenCalledWith('Nguyễn Văn A');
    expect(props.onChangeEmail).toHaveBeenCalledWith('a@meetio.app');
    expect(props.onChangePassword).toHaveBeenCalledWith('matkhaudai8');
  });

  it('calls onSubmit when the primary button is pressed', () => {
    const props = baseProps();
    const renderer = renderSync(<RegisterForm {...props} />);
    act(() => pressableElement(renderer, 'register-submit-button').props.onPress());
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onGooglePress when the Google button is pressed', () => {
    const props = baseProps();
    const renderer = renderSync(<RegisterForm {...props} />);
    act(() => pressableElement(renderer, 'register-google-button').props.onPress());
    expect(props.onGooglePress).toHaveBeenCalledTimes(1);
  });

  it('locks the Google button while submitting, and the submit button while Google is pending', () => {
    const submitting = renderSync(<RegisterForm {...baseProps({ submitting: true })} />);
    const [googleHost] = pressableHosts(submitting, { testID: 'register-google-button' });
    expect(googleHost.props.accessibilityState).toEqual({ disabled: true, busy: false });

    const googlePending = renderSync(<RegisterForm {...baseProps({ googlePending: true })} />);
    const [submitHost] = pressableHosts(googlePending, { testID: 'register-submit-button' });
    expect(submitHost.props.accessibilityState.disabled).toBe(true);
  });

  it('shows the Google error on its own line, separate from the form error', () => {
    const renderer = renderSync(
      <RegisterForm
        {...baseProps({
          errorMessage: 'Email đã được sử dụng.',
          googleErrorMessage: 'Không thể kết nối với Google.',
        })}
      />,
    );

    const formError = renderer.root.findByProps({ testID: 'register-error' });
    const googleError = renderer.root.findByProps({ testID: 'register-google-error' });
    expect(formError.props.children).toBe('Email đã được sử dụng.');
    expect(googleError.props.children).toBe('Không thể kết nối với Google.');
    expect(formError).not.toBe(googleError);
  });

  it('marks the password field as a new-password field, not a login field', () => {
    const renderer = renderSync(<RegisterForm {...baseProps()} />);
    const inputs = renderer.root.findAllByType(TextInput);
    const passwordInput = inputs[2];
    expect(passwordInput.props.secureTextEntry).toBe(true);
    expect(passwordInput.props.autoComplete).toBe('new-password');
  });

  it('shows the same Google label as the login screen', () => {
    const renderer = renderSync(<RegisterForm {...baseProps()} />);
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Tiếp tục với Google');
  });

  it('uses colors.primaryStrong for the navigation link text, not the low-contrast brand orange', () => {
    const renderer = renderSync(<RegisterForm {...baseProps()} />);
    const strongLink = renderer.root
      .findAllByType(Text)
      .find((node) => flatten(node.props.style).color === colors.primaryStrong);
    expect(strongLink).toBeTruthy();
    expect(strongLink!.props.children).toBe('Đăng nhập');
  });

  it('calls onNavigateToLogin when the navigation link is pressed', () => {
    const props = baseProps();
    const renderer = renderSync(<RegisterForm {...props} />);
    act(() => pressableElement(renderer, 'register-login-link').props.onPress());
    expect(props.onNavigateToLogin).toHaveBeenCalledTimes(1);
  });
});

describe('register-form.tsx, as source', () => {
  const read = () => readFileSync(join(__dirname, 'register-form.tsx'), 'utf8');

  /**
   * Held as prefixes on purpose — the phase's own AC states this as a `grep -E`
   * over the whole `auth/` directory, which would otherwise match itself
   * against the full package names written out in this very check. A prefix is
   * strictly more sensitive than the full name, so nothing is lost.
   */
  const FORBIDDEN = ['expo-rout', 'zustan', '@tanstac', 'google-signi', 'api/'];

  it('pulls in no router, store, query client, native module or network call', () => {
    FORBIDDEN.forEach((fragment) => expect(read()).not.toContain(fragment));
  });

  it('stays under the repo-wide 200-line ceiling', () => {
    expect(read().split('\n').length).toBeLessThan(200);
  });
});
