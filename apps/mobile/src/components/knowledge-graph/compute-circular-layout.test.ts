import { computeCircularLayout } from './compute-circular-layout';

describe('computeCircularLayout', () => {
  it('returns an empty map for no nodes', () => {
    expect(computeCircularLayout([]).size).toBe(0);
  });

  it('places a single node at the centre', () => {
    const layout = computeCircularLayout(['a']);
    expect(layout.get('a')).toEqual({ x: 0.5, y: 0.5 });
  });

  it('places the first id at the centre and the rest on a ring around it', () => {
    const layout = computeCircularLayout(['center', 'a', 'b', 'c', 'd']);
    expect(layout.get('center')).toEqual({ x: 0.5, y: 0.5 });
    for (const id of ['a', 'b', 'c', 'd']) {
      const point = layout.get(id);
      expect(point).toBeDefined();
      expect(point).not.toEqual({ x: 0.5, y: 0.5 });
    }
  });

  it('spaces ring nodes evenly (no two share the same position)', () => {
    const layout = computeCircularLayout(['center', 'a', 'b', 'c']);
    const points = ['a', 'b', 'c'].map((id) => layout.get(id));
    const unique = new Set(points.map((p) => `${p?.x.toFixed(4)},${p?.y.toFixed(4)}`));
    expect(unique.size).toBe(3);
  });

  it('keeps every coordinate within the 0..1 fractional range', () => {
    const layout = computeCircularLayout(['center', 'a', 'b', 'c', 'd', 'e', 'f']);
    for (const point of layout.values()) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
  });
});
