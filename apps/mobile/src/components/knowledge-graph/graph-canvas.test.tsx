import TestRenderer, { act } from 'react-test-renderer';
import type { MeetingGraphEdge, MeetingGraphNode } from '@meetio/shared';
import { GraphCanvas, type GraphCanvasProps } from './graph-canvas';
import { GraphEdge } from './graph-edge';
import { GraphEdgeLabel } from './graph-edge-label';
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

function render(overrides: Partial<GraphCanvasProps> = {}, measure = true) {
  const props: GraphCanvasProps = {
    nodes: NODES,
    edges: EDGES,
    selectedId: null,
    onNodePress: jest.fn(),
    onBackgroundPress: jest.fn(),
    ...overrides,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<GraphCanvas {...props} />);
  });
  if (measure) {
    act(() => {
      renderer.root.findByProps({ testID: 'graph-canvas' }).props.onLayout({
        nativeEvent: { layout: { width: 343, height: 380 } },
      });
    });
  }
  return { renderer, props };
}

function nodeById(renderer: TestRenderer.ReactTestRenderer, id: string) {
  return renderer.root.findAllByType(GraphNode).find((n) => n.props.node.id === id)!;
}

describe('GraphCanvas', () => {
  it('renders nothing before the canvas has measured its size', () => {
    const { renderer } = render({}, false);
    expect(renderer.root.findAllByType(GraphNode)).toHaveLength(0);
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(0);
  });

  it('renders the most-mentioned node as the center and the rest as ring pills', () => {
    const { renderer } = render();
    expect(nodeById(renderer, 'du-an-abc').props.variant).toBe('center');
    expect(nodeById(renderer, 'api').props.variant).toBe('ring');
    expect(nodeById(renderer, 'nguyen-van-anh').props.variant).toBe('ring');
  });

  it('draws ring↔ring edges too, and labels only the center’s edges at rest', () => {
    const { renderer } = render();
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(2);
    const labels = renderer.root.findAllByType(GraphEdgeLabel).map((l) => l.props.label);
    expect(labels).toEqual(['thuộc']);
  });

  it('does not crash on an edge with a missing endpoint', () => {
    const badEdges = [{ ...EDGES[0], target_id: 'ghost' }];
    const { renderer } = render({ edges: badEdges });
    expect(renderer.root.findAllByType(GraphEdge)).toHaveLength(0);
  });

  it('renders a single node with no edges', () => {
    const { renderer } = render({ nodes: [NODES[0]], edges: [] });
    expect(renderer.root.findAllByType(GraphNode)).toHaveLength(1);
  });

  it('forwards node taps and empty-canvas taps', () => {
    const { renderer, props } = render();
    act(() => nodeById(renderer, 'api').props.onPress('api'));
    expect(props.onNodePress).toHaveBeenCalledWith('api');
    act(() => renderer.root.findByProps({ testID: 'graph-canvas-background' }).props.onPress());
    expect(props.onBackgroundPress).toHaveBeenCalled();
  });

  it('highlights the selected node’s neighbourhood and dims the rest', () => {
    const { renderer } = render({ selectedId: 'nguyen-van-anh' });
    expect(nodeById(renderer, 'nguyen-van-anh').props.emphasis).toBe('selected');
    expect(nodeById(renderer, 'api').props.emphasis).toBe('related');
    expect(nodeById(renderer, 'du-an-abc').props.emphasis).toBe('dimmed');
    const emphases = renderer.root.findAllByType(GraphEdge).map((e) => e.props.emphasis);
    expect(emphases).toEqual(['active', 'dimmed']);
    const labels = renderer.root.findAllByType(GraphEdgeLabel).map((l) => l.props.label);
    expect(labels).toEqual(['phụ trách']);
  });
});
