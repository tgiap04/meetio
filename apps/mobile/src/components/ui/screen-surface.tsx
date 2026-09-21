import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';

export interface ScreenSurfaceProps {
  children: ReactNode;
  /**
   * Which sides get inset padding. Defaults to the top alone, which is what
   * almost every screen needs: the status bar, the notch and the Dynamic
   * Island all live up there, and the bottom is already handled — tab screens
   * by `BottomTabBar`, stacked screens by their own scroll padding.
   */
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The screen-level container every route sits in.
 *
 * Without it a route's first element is drawn from pixel row zero, so a header
 * ends up underneath the clock and the Dynamic Island, and its top corners are
 * clipped by the display's rounded corners. Screens differ in what they put at
 * the top, but none of them wants to be under the status bar — so the inset
 * belongs in one shared container rather than in each screen's padding, where
 * it would be a number someone has to remember.
 *
 * Decorative full-bleed backdrops (`ScreenBackdrop`) stay OUTSIDE this
 * container: they are supposed to run edge to edge and behind the status bar.
 * Only content gets inset.
 */
export function ScreenSurface({ children, edges = ['top'], style, testID }: ScreenSurfaceProps) {
  return (
    <SafeAreaView edges={edges} style={[styles.surface, style]} testID={testID}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.surface },
});
