import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';

/**
 * The orange fill used by every solid brand shape — the splash icon tile and the
 * round mic buttons.
 *
 * The design's orange is a diagonal gradient, lighter at the top-left and deeper
 * at the bottom-right, not the flat colour this originally shipped with. At the
 * size these shapes render, the difference is visible: a flat fill reads as a
 * sticker, the gradient reads as a surface catching light.
 *
 * Kept as one component rather than repeated `LinearGradient` props so the two
 * endpoints and the diagonal direction stay identical everywhere they appear.
 */
export interface BrandFillProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}

export function BrandFill({ style, children, testID }: BrandFillProps) {
  return (
    <LinearGradient
      testID={testID}
      colors={[colors.primaryGradientFrom, colors.primaryGradientTo]}
      // Top-left to bottom-right, matching the measured diagonal in design.png.
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
