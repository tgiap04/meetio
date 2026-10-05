import {
  CENTER_DIAMETER,
  PILL_HEIGHT,
  PILL_MAX_WIDTH,
  computeGraphLayout,
  type GraphLayout,
  type RingSlot,
} from './compute-graph-layout';

const CANVAS = { width: 343, height: 380 };
const RING_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function rectOf(slot: RingSlot): Rect {
  return {
    left: slot.x - slot.maxWidth / 2,
    right: slot.x + slot.maxWidth / 2,
    top: slot.y - PILL_HEIGHT / 2,
    bottom: slot.y + PILL_HEIGHT / 2,
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function distanceFromRectToPoint(rect: Rect, x: number, y: number): number {
  const nearestX = Math.min(Math.max(x, rect.left), rect.right);
  const nearestY = Math.min(Math.max(y, rect.top), rect.bottom);
  return Math.hypot(x - nearestX, y - nearestY);
}

function layoutFor(ringCount: number, canvas = CANVAS): GraphLayout {
  return computeGraphLayout(['center', ...RING_IDS.slice(0, ringCount)], canvas);
}

describe('computeGraphLayout', () => {
  it('returns no slots for no nodes or an unmeasured canvas', () => {
    expect(computeGraphLayout([], CANVAS)).toEqual({ center: null, ring: [] });
    expect(computeGraphLayout(['a'], { width: 0, height: 380 })).toEqual({ center: null, ring: [] });
  });

  it('puts the first id in the middle of the canvas as the center circle', () => {
    const { center, ring } = computeGraphLayout(['center'], CANVAS);
    expect(center).toEqual({ id: 'center', x: 171.5, y: 190, diameter: CENTER_DIAMETER });
    expect(ring).toHaveLength(0);
  });

  it('starts the ring at the top, directly above the center', () => {
    const { center, ring } = layoutFor(8);
    expect(ring[0].id).toBe('a');
    expect(ring[0].x).toBeCloseTo(center!.x, 5);
    expect(ring[0].y).toBeLessThan(center!.y);
  });

  it('gives roomy slots (top/bottom) the full pill width', () => {
    const { ring } = layoutFor(8);
    expect(ring[0].maxWidth).toBe(PILL_MAX_WIDTH);
    expect(ring[4].maxWidth).toBe(PILL_MAX_WIDTH);
  });

  for (const ringCount of [1, 2, 3, 4, 5, 6, 7, 8]) {
    describe(`with ${ringCount} ring node(s) on a 343×380 canvas`, () => {
      const layout = layoutFor(ringCount);

      it('keeps every pill rect fully inside the canvas', () => {
        for (const slot of layout.ring) {
          const rect = rectOf(slot);
          expect(rect.left).toBeGreaterThanOrEqual(0);
          expect(rect.top).toBeGreaterThanOrEqual(0);
          expect(rect.right).toBeLessThanOrEqual(CANVAS.width);
          expect(rect.bottom).toBeLessThanOrEqual(CANVAS.height);
        }
      });

      it('never lets two pills overlap', () => {
        const rects = layout.ring.map(rectOf);
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            expect(rectsOverlap(rects[i], rects[j])).toBe(false);
          }
        }
      });

      it('keeps every pill clear of the center circle', () => {
        const { center } = layout;
        for (const slot of layout.ring) {
          expect(distanceFromRectToPoint(rectOf(slot), center!.x, center!.y)).toBeGreaterThan(center!.diameter / 2);
        }
      });
    });
  }

  it('still fits 8 ring nodes on a narrow 328pt-wide (360pt phone) canvas', () => {
    const canvas = { width: 328, height: 380 };
    const layout = layoutFor(8, canvas);
    for (const slot of layout.ring) {
      const rect = rectOf(slot);
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(canvas.width);
      expect(distanceFromRectToPoint(rect, layout.center!.x, layout.center!.y)).toBeGreaterThan(CENTER_DIAMETER / 2);
    }
  });
});
