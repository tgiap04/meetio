import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Switch, Text, TextInput } from 'react-native';

/**
 * Exercises `app/(app)/(tabs)/settings.tsx` without touching react-query or
 * expo-router. Mock variables must be prefixed with `mock` (case-insensitive)
 * for Jest's out-of-scope check on `jest.mock()` factories.
 *
 * Lives here rather than next to the route it tests: Expo Router turns every
 * file under `app/` into a route, so a `*.test.tsx` there collides with its
 * own screen's route and drags Jest globals into the app bundle (see
 * `src/navigation/app-group-layout.test.tsx`, which documents the same
 * failure for a layout test). `route-shape.test.ts` also asserts the exact
 * file list inside `(tabs)/`, which a stray test file there breaks.
 *
 * This is the composition-level counterpart to the per-control unit tests in
 * `settings-account-section.test.tsx` — here every preserved control is
 * proven to fire its *real* mutation hook, not just the prop callback passed
 * down to a presentational component. See phase-12's headline risk: a
 * restyle that drops a working control silently.
 */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockUseMeQuery = jest.fn();
jest.mock('../../hooks/use-me-query', () => ({
  useMeQuery: (...args: unknown[]) => mockUseMeQuery(...args),
}));

const mockUpdateMeMutate = jest.fn();
const mockDeleteAccountMutate = jest.fn();
jest.mock('../../hooks/use-account-mutations', () => ({
  useUpdateMeMutation: () => ({ mutate: mockUpdateMeMutate, isPending: false }),
  useDeleteAccountMutation: () => ({ mutate: mockDeleteAccountMutate, isPending: false }),
}));

const mockLogoutMutate = jest.fn();
jest.mock('../../hooks/use-auth-mutations', () => ({
  useLogoutMutation: () => ({ mutate: mockLogoutMutate, isPending: false }),
}));

import SettingsScreen from '../../../app/(app)/(tabs)/settings';
import { RECORDING_SETUP_ROUTE } from '../../navigation/app-routes';

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<SettingsScreen />);
  });
  return renderer;
}

const AUTHENTICATED_USER = {
  display_name: 'Nguyễn Văn Anh',
  email: 'anh.nguyen@meetio.app',
  retention_days: 30,
};

describe('(tabs)/settings screen — restyled, nothing working lost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders LoadingState while /me is pending', () => {
    mockUseMeQuery.mockReturnValue({ isPending: true, isError: false });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'loading-state' })).toBeTruthy();
  });

  it('renders ErrorState and retries on error', () => {
    const refetch = jest.fn();
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('network down'),
      refetch,
    });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'error-state' })).toBeTruthy();
    act(() => {
      renderer.root.findByProps({ testID: 'error-state-retry' }).props.onPress();
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the real profile header (display name and email from /me)', () => {
    mockUseMeQuery.mockReturnValue({ isPending: false, isError: false, data: { user: AUTHENTICATED_USER } });
    const renderer = render();
    const texts = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Nguyễn Văn Anh');
    expect(texts).toContain('anh.nguyen@meetio.app');
  });

  it('routes "Cài đặt ghi âm" to the recording-setup screen', () => {
    mockUseMeQuery.mockReturnValue({ isPending: false, isError: false, data: { user: AUTHENTICATED_USER } });
    const renderer = render();
    const recordingSettingsRow = renderer.root
      .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
      .find((node) =>
        node.findAllByType(Text).some((textNode) => textNode.props.children === 'Cài đặt ghi âm'),
      );
    act(() => {
      recordingSettingsRow?.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith(RECORDING_SETUP_ROUTE);
  });

  it('preserved control 1/5: retention field blur fires useUpdateMeMutation with retention_days', () => {
    mockUseMeQuery.mockReturnValue({ isPending: false, isError: false, data: { user: AUTHENTICATED_USER } });
    const renderer = render();
    const retentionInput = renderer.root.findAllByType(TextInput)[0];
    act(() => {
      retentionInput.props.onChangeText('45');
    });
    act(() => {
      retentionInput.props.onBlur();
    });
    expect(mockUpdateMeMutate).toHaveBeenCalledWith({ retention_days: 45 });
  });

  it('preserved control 2/5: notifications switch fires useUpdateMeMutation with notification_settings', () => {
    mockUseMeQuery.mockReturnValue({ isPending: false, isError: false, data: { user: AUTHENTICATED_USER } });
    const renderer = render();
    const toggle = renderer.root.findAllByType(Switch)[0];
    act(() => {
      toggle.props.onValueChange(false);
    });
    expect(mockUpdateMeMutate).toHaveBeenCalledWith({ notification_settings: { enabled: false } });
  });

  it('meeting-ready push switch fires useUpdateMeMutation with the meeting_ready_push key', () => {
    mockUseMeQuery.mockReturnValue({ isPending: false, isError: false, data: { user: AUTHENTICATED_USER } });
    const renderer = render();
    const toggle = renderer.root.findAllByType(Switch)[1];
    act(() => {
      toggle.props.onValueChange(false);
    });
    expect(mockUpdateMeMutate).toHaveBeenCalledWith({
      notification_settings: { meeting_ready_push: false },
    });
  });

  it('meeting-ready push switch defaults to on when the key is missing (per contract)', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { ...AUTHENTICATED_USER, notification_settings: {} } },
    });
    expect(render().root.findAllByType(Switch)[1].props.value).toBe(true);
  });

  it('meeting-ready push switch reflects a saved false value', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { ...AUTHENTICATED_USER, notification_settings: { meeting_ready_push: false } } },
    });
    expect(render().root.findAllByType(Switch)[1].props.value).toBe(false);
  });

  /**
   * Regression guard. The switch used to be hardcoded `useState(true)` behind a
   * comment claiming `notification_settings` was write-only with no read path.
   * `PublicUser` does expose it — so a user who had turned notifications OFF
   * still saw the switch ON until they touched it, i.e. the screen showed them
   * the opposite of their own saved setting.
   */
  it('reflects the SAVED notification preference rather than defaulting to on', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { ...AUTHENTICATED_USER, notification_settings: { enabled: false } } },
    });
    expect(render().root.findAllByType(Switch)[0].props.value).toBe(false);
  });

  it('falls back to on when the user has never saved a preference', () => {
    mockUseMeQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { user: { ...AUTHENTICATED_USER, notification_settings: {} } },
    });
    expect(render().root.findAllByType(Switch)[0].props.value).toBe(true);
  });

  /**
   * `PublicUser` types `notification_settings` as required, but it arrives over
   * the wire from a server this code does not control. A missing field must not
   * take the whole screen down on a property read.
   */
  it('survives a /me payload with no notification_settings at all', () => {
    mockUseMeQuery.mockReturnValue({ isPending: false, isError: false, data: { user: AUTHENTICATED_USER } });
    expect(render().root.findAllByType(Switch)[0].props.value).toBe(true);
  });

  it('preserved control 3/5: "Đăng xuất" fires useLogoutMutation', () => {
    mockUseMeQuery.mockReturnValue({ isPending: false, isError: false, data: { user: AUTHENTICATED_USER } });
    const renderer = render();
    const buttons = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    );
    const logoutButton = buttons.find((node) =>
      node.findAllByType(Text).some((textNode) => textNode.props.children === 'Đăng xuất'),
    );
    act(() => {
      logoutButton?.props.onPress();
    });
    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });

  it('preserved control 4/5: confirming "Xóa tài khoản" fires useDeleteAccountMutation with the password', () => {
    mockUseMeQuery.mockReturnValue({ isPending: false, isError: false, data: { user: AUTHENTICATED_USER } });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const destructive = buttons?.find((button) => button.style === 'destructive');
      destructive?.onPress?.();
    });
    const renderer = render();

    const passwordInput = renderer.root.findAllByType(TextInput).find((node) => node.props.secureTextEntry);
    act(() => {
      passwordInput?.props.onChangeText('hunter2');
    });

    const buttons = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    );
    const deleteButton = buttons.find((node) =>
      node.findAllByType(Text).some((textNode) => textNode.props.children === 'Xóa tài khoản'),
    );
    act(() => {
      deleteButton?.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(mockDeleteAccountMutate).toHaveBeenCalledWith({ password: 'hunter2' });
    alertSpy.mockRestore();
  });

  it('preserved control 5/5: DevResetButton still renders on the settings screen', () => {
    mockUseMeQuery.mockReturnValue({ isPending: false, isError: false, data: { user: AUTHENTICATED_USER } });
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'dev-reset-button' })).toBeTruthy();
  });
});
