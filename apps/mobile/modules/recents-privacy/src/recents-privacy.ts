import { requireOptionalNativeModule } from 'expo-modules-core';

interface NativeRecentsPrivacy {
  setHidden(hidden: boolean): Promise<boolean>;
}

// Absent on iOS, in Expo Go and in Jest — resolved per call so importing never touches native code.
const lookup = () => requireOptionalNativeModule<NativeRecentsPrivacy>('RecentsPrivacy');

/**
 * Hides (or shows again) the app's thumbnail in the Android app switcher. Never throws: if there is
 * no activity yet or no native module, the app simply behaves as before.
 */
export async function setRecentsHidden(hidden: boolean): Promise<void> {
  try {
    await lookup()?.setHidden(hidden);
  } catch {
    // No current activity (app starting or backgrounded) — the next call applies it.
  }
}
