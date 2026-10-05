/**
 * Edge geometry for the knowledge-graph canvas (screen 10). There is no
 * `react-native-svg` in this project (native module; `/ios` and `/android`
 * are prebuild output), so an edge is a plain `View`: a thin rectangle of the
 * right length, centered on the midpoint and rotated from one node to the
 * other — same technique as `src/components/illustrations/arc.tsx`.
 *
 * All coordinates are canvas points (origin top-left). Edges are trimmed to
 * the node outlines so a line starts and ends at a node's boundary instead
 * of running under its label.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface EdgeGeometry {
  /** Distance between the two points — the edge `View`'s width. */
  readonly length: number;
  /** Degrees, clockwise from horizontal — the edge `View`'s rotation. */
  readonly rotationDeg: number;
  /** Where the edge `View` is centered. */
  readonly midpoint: Point;
}

/** The outline an edge is trimmed to at one end, centered on that end's point. */
export type NodeShape =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'rect'; readonly halfWidth: number; readonly halfHeight: number };

export interface Segment {
  readonly from: Point;
  readonly to: Point;
}

export function computeEdgeGeometry(from: Point, to: Point): EdgeGeometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return {
    length: Math.hypot(dx, dy),
    rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    midpoint: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
  };
}

/** Distance from a shape's center to its outline along the unit direction (ux, uy). */
function distanceToOutline(shape: NodeShape, ux: number, uy: number): number {
  if (shape.kind === 'circle') {
    return shape.radius;
  }
  const alongX = ux === 0 ? Infinity : shape.halfWidth / Math.abs(ux);
  const alongY = uy === 0 ? Infinity : shape.halfHeight / Math.abs(uy);
  return Math.min(alongX, alongY);
}

/**
 * The visible part of the line between two node centers, or `null` when the
 * outlines touch/overlap and there is nothing left to draw.
 */
export function trimSegmentToShapes(
  from: Point,
  fromShape: NodeShape,
  to: Point,
  toShape: NodeShape,
): Segment | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return null;
  }
  const ux = dx / length;
  const uy = dy / length;
  const startOffset = distanceToOutline(fromShape, ux, uy);
  const endOffset = distanceToOutline(toShape, ux, uy);
  if (startOffset + endOffset >= length) {
    return null;
  }
  return {
    from: { x: from.x + ux * startOffset, y: from.y + uy * startOffset },
    to: { x: to.x - ux * endOffset, y: to.y - uy * endOffset },
  };
}
