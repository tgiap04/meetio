import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import type { MeetingGraphEdge, MeetingGraphNode } from '@meetio/shared';
import { GraphCanvas } from './graph-canvas';
import { GraphEdge } from './graph-edge';
import { GraphNode } from './graph-node';

const NODES: readonly MeetingGraphNode[] = [
  { id: 'du-an-abc', canonical_name: 'Dự án ABC', type: 'project', mention_count: 9 },
  { id: 'nguyen-van-anh', canonical_name: 'Nguyễn Văn Anh', type: 'person', mention_count: 3 },
  { id: 'api', canonical_name: 'API', type: 'topic', mention_count: 2 },
];

const EDGES: readonly MeetingGraphEdge[] = [
  { source_id: 'nguyen-van-anh', target_id: 'api', relationship: 'phụ trách', count: 1, chunk_id: 'c1', segment_seq: 1 },
  { source_id: 'api', target_id: 'du-an-abc', relationship: 'thuộc', count: 1, chunk_id: 'c2', segment_seq: 4 },
];

function render(nodes: readonly MeetingGraphNode[], edges: readonly MeetingGraphEdge[]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<GraphCanvas edges={edges} nodes={nodes} />);
  });
  const canvas = renderer.root.findByProps({ testID: 'graph-canvas' });
  act(() => {
    canvas.props.onLayout({ nativeEvent: { layout: { width: 300, height: 460 } } });
  });
  return renderer;
}

describe('GraphCanvas', () => {
  it('renders nothing before the canvas has measured its size', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<GraphCanvas edges={EDGES} nodes={NODES} />);
    });
    expect(renderer.root.findAllByType(GraphNode)).toHaveLength(0);
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'graph-canvas' }).type).toBe(View);
  });

  it('renders every given node once measured', () => {
    const renderer = render(NODES, EDGES);
    const ids = renderer.root.findAllByType(GraphNode).map((n) => n.props.node.id).sort();
    expect(ids).toEqual(['api', 'du-an-abc', 'nguyen-van-anh']);
  });

  it('renders every given edge whose endpoints are present', () => {
    const renderer = render(NODES, EDGES);
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(2);
  });

  it('does not crash on an edge with a missing endpoint', () => {
    const badEdges: readonly MeetingGraphEdge[] = [
      { source_id: 'nguyen-van-anh', target_id: 'ghost', relationship: 'x', count: 1, chunk_id: 'c1', segment_seq: 1 },
    ];
    const renderer = render(NODES, badEdges);
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(0);
  });

  it('renders a single node with no edges', () => {
    const renderer = render([NODES[0]], []);
    expect(renderer.root.findAllByType(GraphNode)).toHaveLength(1);
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(0);
  });
});
