/**
 * The one piece of genuinely testable logic on the knowledge-graph screen
 * (screen 10) — everything else there is presentation. There is no
 * `react-native-svg` in this project (native module, `/ios` and `/android`
 * are gitignored prebuild output), so an edge between two nodes is drawn as a
 * plain `View`: a thin rectangle of the right length, positioned at the
 * midpoint, rotated to point from one node to the other. Same technique as
 * `src/components/illustrations/arc.tsx`.
 *
 * Node positions are stored as fractions of the canvas (0..1 on each axis) —
 * see `graph-canvas.tsx` — so this function takes fractional points plus the
 * canvas's real pixel size (read via `onLayout`) and returns pixel geometry.
 */

export interface FractionalPoint {
  /** 0..1 fraction of canvas width. */
  readonly x: number;
  /** 0..1 fraction of canvas height. */
  readonly y: number;
}

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface EdgeGeometry {
  /** Euclidean distance between the two points, in px — the edge `View`'s width. */
  readonly length: number;
  /** Degrees, clockwise from horizontal — the edge `View`'s rotation. */
  readonly rotationDeg: number;
  /** Px midpoint between the two points — where the edge `View` is centered. */
  readonly midpoint: { readonly x: number; readonly y: number };
}

export function computeEdgeGeometry(from: FractionalPoint, to: FractionalPoint, canvasSize: CanvasSize): EdgeGeometry {
  const fromPx = { x: from.x * canvasSize.width, y: from.y * canvasSize.height };
  const toPx = { x: to.x * canvasSize.width, y: to.y * canvasSize.height };

  const dx = toPx.x - fromPx.x;
  const dy = toPx.y - fromPx.y;

  return {
    length: Math.hypot(dx, dy),
    rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    midpoint: { x: (fromPx.x + toPx.x) / 2, y: (fromPx.y + toPx.y) / 2 },
  };
}
