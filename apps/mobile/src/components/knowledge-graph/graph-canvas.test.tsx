import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import { GraphCanvas } from './graph-canvas';
import { GraphEdge } from './graph-edge';
import { GraphNode } from './graph-node';
import { GRAPH_EDGES, GRAPH_NODES } from '../../mocks';
import type { GraphNodeType } from '../../mocks/types';

function render(activeType: GraphNodeType | 'all') {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<GraphCanvas activeType={activeType} edges={GRAPH_EDGES} nodes={GRAPH_NODES} />);
  });
  // The test renderer never fires a real layout pass — trigger it manually,
  // the same event RN would deliver once the canvas View measures itself.
  const canvas = renderer.root.findByProps({ testID: 'graph-canvas' });
  act(() => {
    canvas.props.onLayout({ nativeEvent: { layout: { width: 300, height: 500 } } });
  });
  return renderer;
}

function nodeIds(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(GraphNode)
    .map((n) => n.props.node.id)
    .sort();
}

describe('GraphCanvas', () => {
  it('renders nothing before the canvas has measured its size', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<GraphCanvas activeType="all" edges={GRAPH_EDGES} nodes={GRAPH_NODES} />);
    });
    expect(renderer.root.findAllByType(GraphNode)).toHaveLength(0);
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'graph-canvas' }).type).toBe(View);
  });

  it('shows all five nodes and four edges under "Tất cả"', () => {
    const renderer = render('all');
    expect(nodeIds(renderer)).toEqual(['api', 'authentication', 'du-an-abc', 'le-thi-mai', 'nguyen-van-anh']);
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(4);
  });

  it('filters to the two Person nodes plus the central node, and their edges only', () => {
    const renderer = render('person');
    expect(nodeIds(renderer)).toEqual(['du-an-abc', 'le-thi-mai', 'nguyen-van-anh']);
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(2);
  });

  it('filters to the two Task nodes plus the central node, and their edges only', () => {
    const renderer = render('task');
    expect(nodeIds(renderer)).toEqual(['api', 'authentication', 'du-an-abc']);
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(2);
  });

  it('never renders an edge with a hidden endpoint', () => {
    const renderer = render('project');
    // Only the central node itself is "project" type — no other node has an
    // edge to draw, so filtering to it alone must leave zero edges.
    expect(nodeIds(renderer)).toEqual(['du-an-abc']);
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(0);
  });

  it('always keeps the central node visible, regardless of filter', () => {
    for (const type of ['all', 'person', 'project', 'task'] as const) {
      const renderer = render(type);
      expect(nodeIds(renderer)).toContain('du-an-abc');
    }
  });
});
