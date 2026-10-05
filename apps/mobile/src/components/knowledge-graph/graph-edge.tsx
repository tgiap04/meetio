import { View } from 'react-native';
import { computeEdgeGeometry, type Point } from './compute-edge-geometry';
import { DIMMED_OPACITY, type EdgeEmphasis } from './graph-highlight';
import { colors } from '../../theme/colors';

export interface GraphEdgeProps {
  /** Already trimmed to the node outlines (`trimSegmentToShapes`). */
  from: Point;
  to: Point;
  emphasis: EdgeEmphasis;
  testID?: string;
}

const RESTING_OPACITY = 0.6;

/** Stroke per emphasis: neutral gray at rest, brand orange and thicker for
 *  the selected node's edges, faded for everything else while selected. */
export const EDGE_STYLES: Record<EdgeEmphasis, { color: string; thickness: number; opacity: number }> = {
  normal: { color: colors.textMuted, thickness: 1.5, opacity: RESTING_OPACITY },
  active: { color: colors.primary, thickness: 2.5, opacity: 1 },
  dimmed: { color: colors.textMuted, thickness: 1.5, opacity: RESTING_OPACITY * DIMMED_OPACITY },
};

/** A straight line drawn as a rotated `View` — no `react-native-svg`.
 *  Rendered beneath the nodes. */
export function GraphEdge({ from, to, emphasis, testID }: GraphEdgeProps) {
  const { length, rotationDeg, midpoint } = computeEdgeGeometry(from, to);
  const { color, thickness, opacity } = EDGE_STYLES[emphasis];

  return (
    <View
      pointerEvents="none"
      testID={testID}
      style={{
        position: 'absolute',
        left: midpoint.x - length / 2,
        top: midpoint.y - thickness / 2,
        width: length,
        height: thickness,
        borderRadius: thickness / 2,
        backgroundColor: color,
        opacity,
        transform: [{ rotate: `${rotationDeg}deg` }],
      }}
    />
  );
}
