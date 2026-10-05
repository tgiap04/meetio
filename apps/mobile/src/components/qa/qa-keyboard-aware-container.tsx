import { useEffect, useState, type ReactNode } from 'react';
import { Dimensions, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** First Android API level where edge-to-edge is enforced (Android 15). */
const EDGE_TO_EDGE_API_LEVEL = 35;

/** Whether this platform needs manual keyboard padding: iOS always; Android only
 *  once edge-to-edge is enforced, because below that the window itself resizes
 *  (adjustResize) and adding padding too would double-pad. */
function needsManualKeyboardPadding(): boolean {
  if (Platform.OS === 'ios') {
    return true;
  }
  return Platform.OS === 'android' && Number(Platform.Version) >= EDGE_TO_EDGE_API_LEVEL;
}

/**
 * Height in px of the part of the keyboard that overlaps the screen, or 0 while
 * hidden / when manual padding is not needed. iOS listens to
 * `keyboardWillChangeFrame` (covers undock, split and hardware-keyboard
 * changes) and measures from the keyboard's top edge to the window bottom.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!needsManualKeyboardPadding()) {
      return undefined;
    }
    const subscriptions =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillChangeFrame', (event) => {
              const windowHeight = Dimensions.get('window').height;
              setHeight(Math.max(0, windowHeight - event.endCoordinates.screenY));
            }),
            Keyboard.addListener('keyboardWillHide', () => setHeight(0)),
          ]
        : [
            Keyboard.addListener('keyboardDidShow', (event) => setHeight(event.endCoordinates.height)),
            Keyboard.addListener('keyboardDidHide', () => setHeight(0)),
          ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  return height;
}

export interface QaKeyboardAwareContainerProps {
  children: ReactNode;
}

/**
 * Bottom-anchored wrapper for the thread + composer. With the keyboard hidden
 * it pads by the bottom safe-area inset (gesture bar); with it shown it pads
 * by the keyboard height instead — the keyboard already covers that inset, so
 * the two are never added together. The container must end at the screen's
 * bottom edge (the screen surface only insets the top).
 */
export function QaKeyboardAwareContainer({ children }: QaKeyboardAwareContainerProps) {
  const keyboardHeight = useKeyboardHeight();
  const { bottom } = useSafeAreaInsets();
  const paddingBottom = keyboardHeight > 0 ? keyboardHeight : bottom;

  return (
    <View style={[styles.flex, { paddingBottom }]} testID="qa-keyboard-aware-container">
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
