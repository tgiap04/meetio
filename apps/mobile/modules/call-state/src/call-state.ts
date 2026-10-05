import { requireOptionalNativeModule } from 'expo-modules-core';

interface NativeCallState {
  startWatching(): void;
  stopWatching(): void;
  addListener(event: 'onCallStateChange', listener: (payload: { busy: boolean }) => void): { remove(): void };
}

// Resolved per call so importing never touches native code: absent on iOS, in Expo Go and in Jest.
const lookup = () => requireOptionalNativeModule<NativeCallState>('CallState');

export const isCallStateAvailable = (): boolean => lookup() != null;

/**
 * Calls `listener(busy)` whenever the phone starts or stops ringing / being in a call, beginning
 * with the current state. Returns the stop function. A no-op where the module is absent.
 */
export function watchCallState(listener: (busy: boolean) => void): () => void {
  const native = lookup();
  if (!native) return () => {};
  const sub = native.addListener('onCallStateChange', ({ busy }) => listener(busy));
  native.startWatching();
  return () => {
    sub.remove();
    native.stopWatching();
  };
}
