import { computeEdgeGeometry } from './compute-edge-geometry';

describe('computeEdgeGeometry', () => {
  const canvasSize = { width: 100, height: 100 };

  it('yields rotation 0 for a horizontal pair', () => {
    const geometry = computeEdgeGeometry({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, canvasSize);
    expect(geometry.rotationDeg).toBe(0);
    expect(geometry.length).toBe(100);
    expect(geometry.midpoint).toEqual({ x: 50, y: 50 });
  });

  it('yields rotation +90 for a downward vertical pair', () => {
    const geometry = computeEdgeGeometry({ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, canvasSize);
    expect(geometry.rotationDeg).toBe(90);
    expect(geometry.length).toBe(100);
  });

  it('yields rotation -90 for an upward vertical pair', () => {
    const geometry = computeEdgeGeometry({ x: 0.5, y: 1 }, { x: 0.5, y: 0 }, canvasSize);
    expect(geometry.rotationDeg).toBe(-90);
    expect(geometry.length).toBe(100);
  });

  it('computes the Euclidean length for a diagonal pair', () => {
    const geometry = computeEdgeGeometry({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, canvasSize);
    // 30-40-50 triangle scaled by the 100x100 canvas.
    expect(geometry.length).toBeCloseTo(50, 5);
  });

  it('scales endpoints by an asymmetric canvas size before measuring', () => {
    const geometry = computeEdgeGeometry({ x: 0, y: 0 }, { x: 1, y: 0 }, { width: 200, height: 50 });
    expect(geometry.length).toBe(200);
    expect(geometry.midpoint).toEqual({ x: 100, y: 0 });
  });

  it('computes the correct midpoint for an off-center pair', () => {
    const geometry = computeEdgeGeometry({ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.6 }, canvasSize);
    expect(geometry.midpoint).toEqual({ x: 50, y: 40 });
  });
});
