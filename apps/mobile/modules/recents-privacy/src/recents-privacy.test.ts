const mockLookup = jest.fn();
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: () => mockLookup(),
}));

import { setRecentsHidden } from './recents-privacy';

it('is a no-op where the native module is absent', async () => {
  mockLookup.mockReturnValue(null);
  await expect(setRecentsHidden(true)).resolves.toBeUndefined();
});

it('forwards the flag to the native module', async () => {
  const native = { setHidden: jest.fn(async () => true) };
  mockLookup.mockReturnValue(native);
  await setRecentsHidden(true);
  await setRecentsHidden(false);
  expect(native.setHidden.mock.calls).toEqual([[true], [false]]);
});

it('swallows a native failure', async () => {
  mockLookup.mockReturnValue({ setHidden: jest.fn(async () => Promise.reject(new Error('no activity'))) });
  await expect(setRecentsHidden(true)).resolves.toBeUndefined();
});
