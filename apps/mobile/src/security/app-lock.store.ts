import { create } from 'zustand';
import { readAppLockEnabled, writeAppLockEnabled } from './app-lock-preference';

/**
 * App-lock state — DEVICE-LOCAL ONLY, like `preferences.store.ts`. `locked` covers the UI and nothing
 * else: recording, the sync worker and the foreground service keep running underneath it.
 *
 * Cold start: `hydrate` resolves `enabled` and starts `locked` when the lock is on, so the first
 * frame after the splash is already the lock screen, never a flash of meeting content.
 */
export type AppLockStatus = 'hydrating' | 'ready';

interface AppLockState {
  status: AppLockStatus;
  enabled: boolean;
  locked: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  lock: () => void;
  unlock: () => void;
}

export const useAppLockStore = create<AppLockState>((set, get) => ({
  status: 'hydrating',
  enabled: false,
  locked: false,
  hydrate: async () => {
    const enabled = await readAppLockEnabled();
    set({ status: 'ready', enabled, locked: enabled });
  },
  setEnabled: async (enabled) => {
    await writeAppLockEnabled(enabled);
    set({ enabled, locked: false });
  },
  lock: () => {
    if (get().enabled) set({ locked: true });
  },
  unlock: () => set({ locked: false }),
}));

export const resetAppLockStore = () => useAppLockStore.setState({ status: 'hydrating', enabled: false, locked: false });
