import { View } from 'react-native';
import { computeEdgeGeometry, type CanvasSize, type FractionalPoint } from './compute-edge-geometry';

export interface GraphEdgeProps {
  from: FractionalPoint;
  to: FractionalPoint;
  canvasSize: CanvasSize;
  /** The connected non-central node's palette text colour (`entity-colors.ts`). */
  color: string;
  testID?: string;
}

const EDGE_THICKNESS = 1.5;

/** A straight line between two graph nodes, drawn as a rotated `View` — no
 *  `react-native-svg`. Rendered under the nodes so the line's raw ends are
 *  covered by the node fills at each join. */
export function GraphEdge({ from, to, canvasSize, color, testID }: GraphEdgeProps) {
  const { length, rotationDeg, midpoint } = computeEdgeGeometry(from, to, canvasSize);

  return (
    <View
      testID={testID}
      style={{
        position: 'absolute',
        left: midpoint.x - length / 2,
        top: midpoint.y - EDGE_THICKNESS / 2,
        width: length,
        height: EDGE_THICKNESS,
        backgroundColor: color,
        transform: [{ rotate: `${rotationDeg}deg` }],
      }}
    />
  );
}
