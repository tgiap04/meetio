/**
 * Point-based layout for the knowledge-graph canvas (screen 10). Replaces the
 * old fractional ring (38% of width, fixed 148pt pills), which overflowed and
 * overlapped on a ~360pt phone.
 *
 * - The first id is the center circle — the caller sorts by `mention_count`.
 * - The rest sit on an ellipse inside the measured canvas, evenly spaced from
 *   the top, clockwise. Each slot's horizontal radius is
 *   `width/2 − halfPillWidth − margin` and the vertical radius is
 *   `height/2 − halfPillHeight − margin`, so a pill can never cross the
 *   canvas bounds by construction.
 * - Each slot also carries its own `maxWidth`. Slots that would collide with
 *   the center circle or a neighbour (typically the 3 and 9 o'clock slots on
 *   a narrow phone) shrink in small steps until they clear; roomy slots keep
 *   the full pill width. Pills render sized to content up to that width.
 */
import type { CanvasSize, Point } from './compute-edge-geometry';

export const CENTER_DIAMETER = 96;
export const PILL_HEIGHT = 44;
export const PILL_MAX_WIDTH = 120;
export const PILL_MIN_WIDTH = 64;
/** Inset between any pill and the canvas edge. */
export const CANVAS_MARGIN = 8;
/** Breathing room between a pill and the center circle, so the edge between them stays visible. */
const CENTER_CLEARANCE = 10;
const SHRINK_STEP = 2;
const MAX_ITERATIONS = 60;

export interface CenterSlot extends Point {
  readonly id: string;
  readonly diameter: number;
}

export interface RingSlot extends Point {
  readonly id: string;
  /** Widest the pill at this slot may render (it is centered on x). */
  readonly maxWidth: number;
}

export interface GraphLayout {
  readonly center: CenterSlot | null;
  readonly ring: readonly RingSlot[];
}

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function boxOf(slot: RingSlot): Box {
  return {
    left: slot.x - slot.maxWidth / 2,
    right: slot.x + slot.maxWidth / 2,
    top: slot.y - PILL_HEIGHT / 2,
    bottom: slot.y + PILL_HEIGHT / 2,
  };
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function boxDistanceTo(box: Box, point: Point): number {
  const nearestX = Math.min(Math.max(point.x, box.left), box.right);
  const nearestY = Math.min(Math.max(point.y, box.top), box.bottom);
  return Math.hypot(point.x - nearestX, point.y - nearestY);
}

function placeRing(ids: readonly string[], widths: readonly number[], size: CanvasSize): RingSlot[] {
  const cx = size.width / 2;
  const cy = size.height / 2;
  const ry = Math.max(0, cy - PILL_HEIGHT / 2 - CANVAS_MARGIN);
  return ids.map((id, index) => {
    const angle = (2 * Math.PI * index) / ids.length - Math.PI / 2;
    const rx = Math.max(0, cx - widths[index] / 2 - CANVAS_MARGIN);
    return { id, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle), maxWidth: widths[index] };
  });
}

/** Indices of slots that collide with the center circle or another slot. */
function findCollisions(ring: readonly RingSlot[], center: Point): Set<number> {
  const boxes = ring.map(boxOf);
  const colliding = new Set<number>();
  boxes.forEach((box, i) => {
    if (boxDistanceTo(box, center) < CENTER_DIAMETER / 2 + CENTER_CLEARANCE) {
      colliding.add(i);
    }
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (boxesOverlap(box, boxes[j])) {
        colliding.add(i);
        colliding.add(j);
      }
    }
  });
  return colliding;
}

export function computeGraphLayout(nodeIds: readonly string[], size: CanvasSize): GraphLayout {
  if (nodeIds.length === 0 || size.width <= 0 || size.height <= 0) {
    return { center: null, ring: [] };
  }

  const [centerId, ...ringIds] = nodeIds;
  const center: CenterSlot = { id: centerId, x: size.width / 2, y: size.height / 2, diameter: CENTER_DIAMETER };
  const widths = ringIds.map(() => PILL_MAX_WIDTH);
  let ring = placeRing(ringIds, widths, size);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const shrinkable = [...findCollisions(ring, center)].filter((i) => widths[i] > PILL_MIN_WIDTH);
    if (shrinkable.length === 0) {
      break;
    }
    for (const i of shrinkable) {
      widths[i] = Math.max(PILL_MIN_WIDTH, widths[i] - SHRINK_STEP);
    }
    ring = placeRing(ringIds, widths, size);
  }

  return { center, ring };
}
