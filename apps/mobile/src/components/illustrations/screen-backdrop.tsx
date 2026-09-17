import { StyleSheet, View } from 'react-native';
import { Blob } from './blob';
import { colors } from '../../theme/colors';

/**
 * The peach shapes behind a screen's content.
 *
 * Every screen in the design sits on warm cream with soft peach shapes drifting
 * off the edges — the background is never a flat wash. The splash screen had
 * these from the start; the onboarding and permission screens shipped without
 * them and read noticeably flatter than the design as a result.
 *
 * `pointerEvents="none"` matters: these are decoration sitting under the content,
 * and they must never intercept a press meant for the button beneath them.
 */
export interface ScreenBackdropProps {
  /** Width of the screen, so the shapes scale with the device rather than a fixed size. */
  width: number;
  testID?: string;
}

export function ScreenBackdrop({ width, testID }: ScreenBackdropProps) {
  const blobSize = width * 0.86;

  return (
    <View testID={testID} pointerEvents="none" style={styles.layer}>
      <View style={[styles.topRight, { top: -blobSize * 0.42, right: -blobSize * 0.34 }]}>
        <Blob size={blobSize} variant="topRight" testID={testID ? `${testID}-top` : undefined} />
      </View>
      <View style={[styles.bottomLeft, { bottom: -blobSize * 0.46, left: -blobSize * 0.38 }]}>
        <Blob size={blobSize} variant="bottomLeft" testID={testID ? `${testID}-bottom` : undefined} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    // Explicit offsets rather than StyleSheet.absoluteFillObject — that helper is
    // absent from this React Native version's type definitions.
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  topRight: { position: 'absolute' },
  bottomLeft: { position: 'absolute' },
});
