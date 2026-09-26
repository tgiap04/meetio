import type { MeetingGraphEdge, MeetingGraphNode } from '@meetio/shared';
import { MAX_GRAPH_NODES, selectVisibleGraphNodes } from './select-visible-graph-nodes';

function node(overrides: Partial<MeetingGraphNode> = {}): MeetingGraphNode {
  return { id: 'n1', canonical_name: 'N1', type: 'person', mention_count: 1, ...overrides };
}

function edge(overrides: Partial<MeetingGraphEdge> = {}): MeetingGraphEdge {
  return {
    source_id: 'n1',
    target_id: 'n2',
    relationship: 'phụ trách',
    count: 1,
    chunk_id: 'c1',
    segment_seq: 1,
    ...overrides,
  };
}

describe('selectVisibleGraphNodes', () => {
  it('keeps every node under the cap and reports zero hidden', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b' })];
    const result = selectVisibleGraphNodes(nodes, [], 'all');
    expect(result.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(result.hiddenCount).toBe(0);
  });

  it('filters by chip, folding organization/product/other into "other"', () => {
    const nodes = [node({ id: 'p', type: 'person' }), node({ id: 'o', type: 'organization' })];
    const result = selectVisibleGraphNodes(nodes, [], 'other');
    expect(result.nodes.map((n) => n.id)).toEqual(['o']);
  });

  it('sorts by mention_count descending', () => {
    const nodes = [node({ id: 'low', mention_count: 1 }), node({ id: 'high', mention_count: 9 })];
    const result = selectVisibleGraphNodes(nodes, [], 'all');
    expect(result.nodes.map((n) => n.id)).toEqual(['high', 'low']);
  });

  it('caps at MAX_GRAPH_NODES and reports how many were hidden', () => {
    const nodes = Array.from({ length: MAX_GRAPH_NODES + 3 }, (_, i) => node({ id: `n${i}`, mention_count: i }));
    const result = selectVisibleGraphNodes(nodes, [], 'all');
    expect(result.nodes).toHaveLength(MAX_GRAPH_NODES);
    expect(result.hiddenCount).toBe(3);
  });

  it('drops an edge when either endpoint was filtered or capped out', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b' })];
    const edges = [edge({ source_id: 'a', target_id: 'b' }), edge({ source_id: 'a', target_id: 'missing' })];
    const result = selectVisibleGraphNodes(nodes, edges, 'all');
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].target_id).toBe('b');
  });
});
