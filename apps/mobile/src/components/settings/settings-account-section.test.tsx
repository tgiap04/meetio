import TestRenderer, { act } from 'react-test-renderer';
import { Switch, TextInput } from 'react-native';

// `DevResetButton` (rendered inside `SettingsAccountSection`) imports
// `expo-router` for its own reset-navigation call. That call is never
// exercised here (`DevResetButton` is only checked for presence), but the
// real module is ESM and breaks Jest's CJS transform on import — mock it,
// same as every other test that renders a component in this chain.
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

import { SettingsAccountSection } from './settings-account-section';

function baseProps() {
  return {
    retentionDaysValue: '30',
    onRetentionDaysChange: jest.fn(),
    onRetentionDaysBlur: jest.fn(),
    notificationsEnabled: true,
    onToggleNotifications: jest.fn(),
    meetingReadyPushEnabled: true,
    onToggleMeetingReadyPush: jest.fn(),
    onLogoutPress: jest.fn(),
    logoutLoading: false,
    deletePassword: '',
    onDeletePasswordChange: jest.fn(),
    onDeleteAccountPress: jest.fn(),
    deleteAccountLoading: false,
  };
}

function render(props: ReturnType<typeof baseProps>) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SettingsAccountSection {...props} />);
  });
  return renderer;
}

// react-native's Pressable renders three layers that all carry
// `accessibilityRole`; only the outermost also carries `onPress` as a
// function, so filtering on both gives exactly one match per pressable.
// Order: 0 = "Đăng xuất", 1 = "Xóa tài khoản", 2 = DevResetButton.
function findButton(renderer: TestRenderer.ReactTestRenderer, index: number) {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  )[index];
}

describe('SettingsAccountSection — one test per preserved account control', () => {
  it('retention field: blurring fires onRetentionDaysBlur (useUpdateMeMutation)', () => {
    const props = baseProps();
    const renderer = render(props);
    const input = renderer.root.findAllByType(TextInput)[0];
    act(() => {
      input.props.onBlur();
    });
    expect(props.onRetentionDaysBlur).toHaveBeenCalledTimes(1);
  });

  it('notifications switch: toggling fires onToggleNotifications (useUpdateMeMutation)', () => {
    const props = baseProps();
    const renderer = render(props);
    const toggle = renderer.root.findAllByType(Switch)[0];
    act(() => {
      toggle.props.onValueChange(false);
    });
    expect(props.onToggleNotifications).toHaveBeenCalledWith(false);
  });

  it('meeting-ready push switch: toggling fires onToggleMeetingReadyPush', () => {
    const props = baseProps();
    const renderer = render(props);
    const toggle = renderer.root.findAllByType(Switch)[1];
    act(() => {
      toggle.props.onValueChange(false);
    });
    expect(props.onToggleMeetingReadyPush).toHaveBeenCalledWith(false);
  });

  it('logout: pressing "Đăng xuất" fires onLogoutPress (useLogoutMutation)', () => {
    const props = baseProps();
    const renderer = render(props);
    act(() => {
      findButton(renderer, 0).props.onPress();
    });
    expect(props.onLogoutPress).toHaveBeenCalledTimes(1);
  });

  it('delete account: pressing "Xóa tài khoản" fires onDeleteAccountPress (useDeleteAccountMutation)', () => {
    const props = baseProps();
    const renderer = render(props);
    act(() => {
      findButton(renderer, 1).props.onPress();
    });
    expect(props.onDeleteAccountPress).toHaveBeenCalledTimes(1);
  });

  it('delete account: the password field keeps secureTextEntry', () => {
    const props = baseProps();
    const renderer = render(props);
    const inputs = renderer.root.findAllByType(TextInput);
    const passwordInput = inputs.find((node) => node.props.secureTextEntry === true);
    expect(passwordInput).toBeTruthy();
  });

  it('DevResetButton: renders in __DEV__ (dev tool preserved)', () => {
    const renderer = render(baseProps());
    expect(renderer.root.findByProps({ testID: 'dev-reset-button' })).toBeTruthy();
  });
});
