import TestRenderer, { act } from 'react-test-renderer';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { SettingsSecuritySection } from './settings-security-section';
import { resetAppLockStore, useAppLockStore } from '../../security/app-lock.store';

const auth = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
const mounted: TestRenderer.ReactTestRenderer[] = [];

beforeEach(async () => {
  await SecureStore.deleteItemAsync('meetio.app_lock_enabled');
  resetAppLockStore();
});
afterEach(() => act(() => mounted.splice(0).forEach((t) => t.unmount())));

async function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<SettingsSecuritySection />);
  });
  mounted.push(tree);
  return tree;
}
const toggle = (tree: TestRenderer.ReactTestRenderer) => tree.root.findByProps({ testID: 'settings-app-lock-switch' });

it('enables the lock only after a successful prompt', async () => {
  const tree = await render();
  await act(async () => toggle(tree).props.onValueChange(true));
  expect(useAppLockStore.getState().enabled).toBe(true);
  expect(await SecureStore.getItemAsync('meetio.app_lock_enabled')).toBe('1');
});

it('leaves the lock off when the prompt is cancelled', async () => {
  auth.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
  const tree = await render();
  await act(async () => toggle(tree).props.onValueChange(true));
  expect(useAppLockStore.getState().enabled).toBe(false);
});

it('asks before turning the lock off as well', async () => {
  await useAppLockStore.getState().setEnabled(true);
  auth.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
  const tree = await render();
  await act(async () => toggle(tree).props.onValueChange(false));
  expect(useAppLockStore.getState().enabled).toBe(true);
});

it('disables the switch and explains why on a phone with no credential', async () => {
  auth.getEnrolledLevelAsync.mockResolvedValueOnce(LocalAuthentication.SecurityLevel.NONE);
  const tree = await render();
  expect(toggle(tree).props.disabled).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('chưa cài vân tay');
});
