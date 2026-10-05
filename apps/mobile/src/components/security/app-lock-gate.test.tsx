import { Text, AppState, type AppStateStatus } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { AppLockGate } from './app-lock-gate';
import { resetAppLockStore, useAppLockStore } from '../../security/app-lock.store';
import { LOCK_AFTER_BACKGROUND_MS } from '../../security/app-lock-policy';
import { setRecentsHidden } from '../../../modules/recents-privacy';

jest.mock('../../../modules/recents-privacy', () => ({ setRecentsHidden: jest.fn(async () => {}) }));
const recentsHidden = setRecentsHidden as jest.Mock;

const auth = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
let emitAppState: (s: AppStateStatus) => void = () => {};
const mounted: TestRenderer.ReactTestRenderer[] = [];

beforeEach(async () => {
  await SecureStore.deleteItemAsync('meetio.app_lock_enabled');
  resetAppLockStore();
  auth.authenticateAsync.mockClear();
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    emitAppState = listener as (s: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  // The store is shared: a tree left mounted would keep reacting to the next test's lock state.
  act(() => mounted.splice(0).forEach((t) => t.unmount()));
  jest.restoreAllMocks();
});

async function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <AppLockGate>
        <Text testID="content">meetings</Text>
      </AppLockGate>,
    );
  });
  mounted.push(tree);
  return tree;
}

const cover = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAllByProps({ testID: 'app-lock-cover' });

it('shows the content with no cover when the lock is off', async () => {
  const tree = await render();
  expect(cover(tree)).toHaveLength(0);
  expect(tree.root.findByProps({ testID: 'content' })).toBeTruthy();
  expect(auth.authenticateAsync).not.toHaveBeenCalled();
});

it('starts locked and prompts at once when the lock is on, then uncovers on success', async () => {
  await SecureStore.setItemAsync('meetio.app_lock_enabled', '1');
  const tree = await render();
  expect(auth.authenticateAsync).toHaveBeenCalledTimes(1);
  expect(cover(tree)).toHaveLength(0);
  // The content stayed mounted the whole time — the cover is an overlay, not a replacement.
  expect(tree.root.findByProps({ testID: 'content' })).toBeTruthy();
});

it('stays covered when the prompt is cancelled, and the button retries', async () => {
  await SecureStore.setItemAsync('meetio.app_lock_enabled', '1');
  auth.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
  const tree = await render();
  expect(cover(tree).length).toBeGreaterThan(0);

  await act(async () => {
    tree.root.findAllByProps({ testID: 'app-lock-unlock' })[0].props.onPress();
  });
  expect(auth.authenticateAsync).toHaveBeenCalledTimes(2);
  expect(cover(tree)).toHaveLength(0);
});

it('re-locks after a long background stay but not after a short one', async () => {
  await useAppLockStore.getState().setEnabled(true);
  const nowSpy = jest.spyOn(Date, 'now');
  const tree = await render();
  // Hydration read the flag — lock is on, user unlocked by the auto-prompt.
  expect(cover(tree)).toHaveLength(0);

  nowSpy.mockReturnValue(1_000);
  act(() => emitAppState('background'));
  nowSpy.mockReturnValue(1_000 + LOCK_AFTER_BACKGROUND_MS - 1);
  act(() => emitAppState('active'));
  expect(useAppLockStore.getState().locked).toBe(false);

  auth.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
  nowSpy.mockReturnValue(10_000);
  act(() => emitAppState('background'));
  nowSpy.mockReturnValue(10_000 + LOCK_AFTER_BACKGROUND_MS);
  await act(async () => emitAppState('active'));
  expect(useAppLockStore.getState().locked).toBe(true);
  expect(cover(tree).length).toBeGreaterThan(0);
});

it('hides the covered content from screen readers and makes the cover modal', async () => {
  await SecureStore.setItemAsync('meetio.app_lock_enabled', '1');
  auth.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
  const tree = await render();
  const wrapper = tree.root.findByProps({ testID: 'content' }).parent!;
  expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(cover(tree)[0].props.accessibilityViewIsModal).toBe(true);

  await act(async () => {
    tree.root.findAllByProps({ testID: 'app-lock-unlock' })[0].props.onPress();
  });
  expect(tree.root.findByProps({ testID: 'content' }).parent!.props.importantForAccessibility).toBe('auto');
});

it('blanks the app-switcher thumbnail exactly while the lock is on', async () => {
  recentsHidden.mockClear();
  await render();
  expect(recentsHidden).toHaveBeenLastCalledWith(false);
  await act(async () => useAppLockStore.getState().setEnabled(true));
  expect(recentsHidden).toHaveBeenLastCalledWith(true);
  await act(async () => useAppLockStore.getState().setEnabled(false));
  expect(recentsHidden).toHaveBeenLastCalledWith(false);
});

it('re-applies the thumbnail setting each time the app comes to the foreground', async () => {
  await useAppLockStore.getState().setEnabled(true);
  await render();
  recentsHidden.mockClear();
  act(() => emitAppState('active'));
  expect(recentsHidden).toHaveBeenCalledWith(true);
});
