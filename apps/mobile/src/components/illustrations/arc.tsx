import { View, type ViewStyle } from 'react-native';

/**
 * Every curved stroke in the onboarding/splash/permission screens (concentric
 * rings on the permission screen, the sound-wave arcs beside the mic, the
 * rounded vault under `MicGlyph`) is built from this one primitive, never
 * `react-native-svg` (not installed — see plan decisions §5).
 *
 * ## The technique: a circle border with some sides made transparent
 *
 * A `View` with equal width/height, `borderRadius: size / 2` and a uniform
 * `borderWidth` renders as a full ring. Coloring only some of the four
 * `border{Top,Right,Bottom,Left}Color` values (and leaving the rest
 * `'transparent'`) leaves visible only the ring segments on those sides —
 * because in React Native's border-rendering model each side's color applies
 * to that side's rounded arc independently, the transparent sides genuinely
 * disappear rather than showing a seam. `arcSpan` picks how many of the four
 * sides are colored, starting at the top and going clockwise (top → right →
 * bottom → left); `rotation` (degrees) then spins the whole ring so the
 * visible segment lands where the design needs it. This only cleanly
 * produces quarter-turn arc lengths (90°/180°/270°/360°) — which is exactly
 * what every use in this design needs (quarter-circle vaults, half-circle
 * sound waves, full concentric rings).
 */
export type ArcSpan = 'quarter' | 'half' | 'threeQuarters' | 'full';

type BorderSide = 'top' | 'right' | 'bottom' | 'left';

const SPAN_SIDES: Record<ArcSpan, readonly BorderSide[]> = {
  quarter: ['top'],
  half: ['top', 'right'],
  threeQuarters: ['top', 'right', 'bottom'],
  full: ['top', 'right', 'bottom', 'left'],
};

export interface ArcProps {
  /** Outer diameter in px. Every other measurement derives from this. */
  size: number;
  arcSpan: ArcSpan;
  color: string;
  /** Stroke width in px. Defaults to 8% of `size`, floored at 2px. */
  thickness?: number;
  /** Degrees, clockwise, applied after side selection. */
  rotation?: number;
  testID?: string;
}

export function Arc({ size, arcSpan, color, thickness, rotation = 0, testID }: ArcProps) {
  const resolvedThickness = thickness ?? Math.max(2, Math.round(size * 0.08));
  const visibleSides = SPAN_SIDES[arcSpan];

  const style: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: resolvedThickness,
    borderTopColor: visibleSides.includes('top') ? color : 'transparent',
    borderRightColor: visibleSides.includes('right') ? color : 'transparent',
    borderBottomColor: visibleSides.includes('bottom') ? color : 'transparent',
    borderLeftColor: visibleSides.includes('left') ? color : 'transparent',
    transform: [{ rotate: `${rotation}deg` }],
  };

  return <View testID={testID} style={style} />;
}
