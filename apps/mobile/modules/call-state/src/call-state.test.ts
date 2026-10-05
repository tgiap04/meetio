const mockLookup = jest.fn();
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: () => mockLookup(),
}));

import { isCallStateAvailable, watchCallState } from './call-state';

it('is a no-op where the native module is absent (iOS, Expo Go, Jest)', () => {
  mockLookup.mockReturnValue(null);
  expect(isCallStateAvailable()).toBe(false);
  const stop = watchCallState(jest.fn());
  expect(() => stop()).not.toThrow();
});

it('forwards busy changes and stops watching on unsubscribe', () => {
  let emit!: (p: { busy: boolean }) => void;
  const remove = jest.fn();
  const native = {
    startWatching: jest.fn(),
    stopWatching: jest.fn(),
    addListener: jest.fn((_e: string, fn: (p: { busy: boolean }) => void) => {
      emit = fn;
      return { remove };
    }),
  };
  mockLookup.mockReturnValue(native);
  const listener = jest.fn();
  const stop = watchCallState(listener);
  expect(native.startWatching).toHaveBeenCalled();
  emit({ busy: true });
  emit({ busy: false });
  expect(listener.mock.calls).toEqual([[true], [false]]);
  stop();
  expect(remove).toHaveBeenCalled();
  expect(native.stopWatching).toHaveBeenCalled();
});
