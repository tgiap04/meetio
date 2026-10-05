import { computeEdgeGeometry, trimSegmentToShapes } from './compute-edge-geometry';

describe('computeEdgeGeometry', () => {
  it('yields rotation 0, the length and the midpoint for a horizontal pair', () => {
    const geometry = computeEdgeGeometry({ x: 0, y: 50 }, { x: 100, y: 50 });
    expect(geometry).toEqual({ length: 100, rotationDeg: 0, midpoint: { x: 50, y: 50 } });
  });

  it('yields rotation +90 downward and -90 upward', () => {
    expect(computeEdgeGeometry({ x: 50, y: 0 }, { x: 50, y: 100 }).rotationDeg).toBe(90);
    expect(computeEdgeGeometry({ x: 50, y: 100 }, { x: 50, y: 0 }).rotationDeg).toBe(-90);
  });

  it('computes the Euclidean length for a diagonal pair', () => {
    expect(computeEdgeGeometry({ x: 0, y: 0 }, { x: 30, y: 40 }).length).toBeCloseTo(50, 5);
  });
});

describe('trimSegmentToShapes', () => {
  it('trims a circle endpoint by its radius', () => {
    const segment = trimSegmentToShapes(
      { x: 0, y: 0 },
      { kind: 'circle', radius: 10 },
      { x: 100, y: 0 },
      { kind: 'circle', radius: 20 },
    );
    expect(segment?.from).toEqual({ x: 10, y: 0 });
    expect(segment?.to).toEqual({ x: 80, y: 0 });
  });

  it('trims a rect endpoint where the line exits its side (horizontal)', () => {
    const segment = trimSegmentToShapes(
      { x: 0, y: 0 },
      { kind: 'rect', halfWidth: 30, halfHeight: 10 },
      { x: 100, y: 0 },
      { kind: 'circle', radius: 0 },
    );
    expect(segment?.from.x).toBeCloseTo(30, 5);
    expect(segment?.from.y).toBeCloseTo(0, 5);
  });

  it('trims a rect endpoint where the line exits its top/bottom (steep line)', () => {
    const segment = trimSegmentToShapes(
      { x: 0, y: 0 },
      { kind: 'rect', halfWidth: 30, halfHeight: 10 },
      { x: 10, y: 100 },
      { kind: 'circle', radius: 0 },
    );
    // Exits the bottom edge (y = 10) at x = 1.
    expect(segment?.from.y).toBeCloseTo(10, 5);
    expect(segment?.from.x).toBeCloseTo(1, 5);
  });

  it('returns null when the two shapes overlap (nothing visible to draw)', () => {
    const segment = trimSegmentToShapes(
      { x: 0, y: 0 },
      { kind: 'circle', radius: 40 },
      { x: 50, y: 0 },
      { kind: 'rect', halfWidth: 20, halfHeight: 10 },
    );
    expect(segment).toBeNull();
  });

  it('returns null for coincident points', () => {
    const shape = { kind: 'circle' as const, radius: 1 };
    expect(trimSegmentToShapes({ x: 5, y: 5 }, shape, { x: 5, y: 5 }, shape)).toBeNull();
  });
});
