/**
 * Positions an arbitrary number of real graph nodes on a circle, as fractions
 * of the canvas (0..1 per axis) — replaces the mock build's hand-placed,
 * five-node-only `NODE_POSITIONS` table, which cannot work for a real
 * meeting's node count. One node sits at the centre; that keeps a visual
 * focal point without the API telling us which node "is" central (the real
 * `MeetingGraphNode` carries no `isCentral` flag) — the node with the
 * highest `mention_count` is the caller's job to put first in `nodeIds`.
 */
import type { FractionalPoint } from './compute-edge-geometry';

const RING_RADIUS_FRACTION = 0.38;
const CENTER: FractionalPoint = { x: 0.5, y: 0.5 };

export function computeCircularLayout(nodeIds: readonly string[]): ReadonlyMap<string, FractionalPoint> {
  const positions = new Map<string, FractionalPoint>();
  if (nodeIds.length === 0) {
    return positions;
  }

  const [centerId, ...ringIds] = nodeIds;
  positions.set(centerId, CENTER);

  const count = ringIds.length;
  ringIds.forEach((id, index) => {
    // Start at the top (-90°) and go clockwise, matching the mock's visual
    // convention (two nodes up top, two below).
    const angle = (2 * Math.PI * index) / count - Math.PI / 2;
    positions.set(id, {
      x: CENTER.x + RING_RADIUS_FRACTION * Math.cos(angle),
      y: CENTER.y + RING_RADIUS_FRACTION * Math.sin(angle),
    });
  });

  return positions;
}
