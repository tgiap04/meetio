import * as SecureStore from 'expo-secure-store';
import { resetAppLockStore, useAppLockStore } from './app-lock.store';

const secureStore = SecureStore as jest.Mocked<typeof SecureStore>;

describe('app-lock store', () => {
  beforeEach(async () => {
    await secureStore.deleteItemAsync('meetio.app_lock_enabled');
    resetAppLockStore();
  });

  it('hydrates unlocked and disabled when the flag was never set', async () => {
    await useAppLockStore.getState().hydrate();
    expect(useAppLockStore.getState()).toMatchObject({ status: 'ready', enabled: false, locked: false });
  });

  it('hydrates already locked when the lock is enabled', async () => {
    await secureStore.setItemAsync('meetio.app_lock_enabled', '1');
    await useAppLockStore.getState().hydrate();
    expect(useAppLockStore.getState()).toMatchObject({ status: 'ready', enabled: true, locked: true });
  });

  it('fails open when the stored flag cannot be read', async () => {
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('keystore'));
    await useAppLockStore.getState().hydrate();
    expect(useAppLockStore.getState()).toMatchObject({ enabled: false, locked: false });
  });

  it('persists enable/disable and never locks the user out at the moment of toggling', async () => {
    await useAppLockStore.getState().setEnabled(true);
    expect(await secureStore.getItemAsync('meetio.app_lock_enabled')).toBe('1');
    expect(useAppLockStore.getState()).toMatchObject({ enabled: true, locked: false });

    await useAppLockStore.getState().setEnabled(false);
    expect(await secureStore.getItemAsync('meetio.app_lock_enabled')).toBeNull();
  });

  it('lock() is a no-op while the feature is disabled', () => {
    useAppLockStore.getState().lock();
    expect(useAppLockStore.getState().locked).toBe(false);
  });

  it('lock() and unlock() toggle the cover when enabled', async () => {
    await useAppLockStore.getState().setEnabled(true);
    useAppLockStore.getState().lock();
    expect(useAppLockStore.getState().locked).toBe(true);
    useAppLockStore.getState().unlock();
    expect(useAppLockStore.getState().locked).toBe(false);
  });
});
