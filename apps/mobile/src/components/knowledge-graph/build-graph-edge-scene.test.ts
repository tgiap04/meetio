import type { MeetingGraphEdge } from '@meetio/shared';
import { buildGraphEdgeScene } from './build-graph-edge-scene';
import type { GraphLayout } from './compute-graph-layout';

function edge(source_id: string, target_id: string, relationship: string): MeetingGraphEdge {
  return { source_id, target_id, relationship, count: 1, chunk_id: 'c', segment_seq: 1 };
}

// Center at (150, 200) r=48; "top" pill 44pt tall at (150, 40); "right" pill at (260, 200).
const LAYOUT: GraphLayout = {
  center: { id: 'hub', x: 150, y: 200, diameter: 96 },
  ring: [
    { id: 'top', x: 150, y: 40, maxWidth: 120 },
    { id: 'right', x: 260, y: 200, maxWidth: 100 },
  ],
};
const WIDTHS = new Map([
  ['top', 80],
  ['right', 60],
]);

describe('buildGraphEdgeScene', () => {
  it('trims a center↔pill edge to the circle and the pill outline', () => {
    const [item] = buildGraphEdgeScene([edge('hub', 'top', 'thuộc')], LAYOUT, WIDTHS, null);
    expect(item.from).toEqual({ x: 150, y: 152 }); // 200 − r48
    expect(item.to).toEqual({ x: 150, y: 62 }); // 40 + half pill height 22
  });

  it('trims horizontally by the measured half pill width', () => {
    const [item] = buildGraphEdgeScene([edge('hub', 'right', 'x')], LAYOUT, WIDTHS, null);
    expect(item.from.x).toBeCloseTo(198, 5);
    expect(item.to.x).toBeCloseTo(230, 5); // 260 − 60/2
  });

  it('falls back to the narrowest pill before a width is measured (line hides under the pill)', () => {
    const [item] = buildGraphEdgeScene([edge('hub', 'right', 'x')], LAYOUT, new Map(), null);
    expect(item.to.x).toBeCloseTo(238, 5); // 260 − 44/2
  });

  it('labels only the center’s edges when nothing is selected', () => {
    const scene = buildGraphEdgeScene([edge('hub', 'top', 'thuộc'), edge('top', 'right', 'gặp')], LAYOUT, WIDTHS, null);
    expect(scene[0].label).toEqual({ text: 'thuộc', at: { x: 150, y: 107 }, active: false });
    expect(scene[1].label).toBeNull();
  });

  it('labels and activates the selected node’s edges, dimming the rest', () => {
    const scene = buildGraphEdgeScene([edge('hub', 'top', 'thuộc'), edge('top', 'right', 'gặp')], LAYOUT, WIDTHS, 'right');
    expect(scene[0]).toEqual(expect.objectContaining({ emphasis: 'dimmed', label: null }));
    expect(scene[1].emphasis).toBe('active');
    expect(scene[1].label?.text).toBe('gặp');
    expect(scene[1].label?.active).toBe(true);
  });

  it('labels a repeated node pair only once', () => {
    const scene = buildGraphEdgeScene([edge('hub', 'top', 'thuộc'), edge('top', 'hub', 'chứa')], LAYOUT, WIDTHS, null);
    expect(scene.filter((item) => item.label !== null)).toHaveLength(1);
  });

  it('skips the label when the visible segment is too short for a chip', () => {
    const tight: GraphLayout = { ...LAYOUT, ring: [{ id: 'right', x: 215, y: 200, maxWidth: 40 }] };
    const scene = buildGraphEdgeScene([edge('hub', 'right', 'x')], tight, new Map([['right', 30]]), null);
    expect(scene).toHaveLength(1);
    expect(scene[0].label).toBeNull();
  });

  it('drops edges with an endpoint outside the layout', () => {
    expect(buildGraphEdgeScene([edge('hub', 'ghost', 'x')], LAYOUT, WIDTHS, null)).toEqual([]);
  });
});
