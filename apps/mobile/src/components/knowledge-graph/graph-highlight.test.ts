import type { MeetingGraphEdge } from '@meetio/shared';
import {
  collectNeighborIds,
  filterRelationsForNode,
  getEdgeEmphasis,
  getNodeEmphasis,
  shouldShowEdgeLabel,
  toggleNodeSelection,
} from './graph-highlight';

function edge(source_id: string, target_id: string, relationship = 'liên quan'): MeetingGraphEdge {
  return { source_id, target_id, relationship, count: 1, chunk_id: 'c', segment_seq: 1 };
}

const EDGES = [edge('a', 'b'), edge('c', 'a'), edge('b', 'c'), edge('d', 'e')];

describe('toggleNodeSelection', () => {
  it('selects a node when nothing is selected', () => {
    expect(toggleNodeSelection(null, 'a')).toBe('a');
  });

  it('switches to another node', () => {
    expect(toggleNodeSelection('a', 'b')).toBe('b');
  });

  it('clears when the selected node is tapped again', () => {
    expect(toggleNodeSelection('a', 'a')).toBeNull();
  });
});

describe('filterRelationsForNode', () => {
  it('returns every relation when nothing is selected', () => {
    expect(filterRelationsForNode(EDGES, null)).toBe(EDGES);
  });

  it('keeps only relations where the node is the source or the target', () => {
    expect(filterRelationsForNode(EDGES, 'a')).toEqual([EDGES[0], EDGES[1]]);
  });

  it('returns nothing for a node with no relations', () => {
    expect(filterRelationsForNode(EDGES, 'zzz')).toEqual([]);
  });
});

describe('collectNeighborIds / getNodeEmphasis', () => {
  it('collects the nodes on the other end of the selected node’s edges', () => {
    expect([...collectNeighborIds(EDGES, 'a')].sort()).toEqual(['b', 'c']);
    expect(collectNeighborIds(EDGES, null).size).toBe(0);
  });

  it('marks selected / related / dimmed, and everything normal with no selection', () => {
    const neighbors = collectNeighborIds(EDGES, 'a');
    expect(getNodeEmphasis('a', 'a', neighbors)).toBe('selected');
    expect(getNodeEmphasis('b', 'a', neighbors)).toBe('related');
    expect(getNodeEmphasis('d', 'a', neighbors)).toBe('dimmed');
    expect(getNodeEmphasis('d', null, new Set())).toBe('normal');
  });
});

describe('getEdgeEmphasis', () => {
  it('activates the selected node’s edges and dims the rest', () => {
    expect(getEdgeEmphasis(EDGES[1], 'a')).toBe('active');
    expect(getEdgeEmphasis(EDGES[2], 'a')).toBe('dimmed');
  });

  it('is normal with no selection', () => {
    expect(getEdgeEmphasis(EDGES[0], null)).toBe('normal');
  });
});

describe('shouldShowEdgeLabel', () => {
  it('labels only edges touching the center when nothing is selected', () => {
    expect(shouldShowEdgeLabel(EDGES[0], 'a', null)).toBe(true);
    expect(shouldShowEdgeLabel(EDGES[2], 'a', null)).toBe(false);
  });

  it('labels only the selected node’s edges when a node is selected', () => {
    expect(shouldShowEdgeLabel(EDGES[2], 'a', 'b')).toBe(true);
    expect(shouldShowEdgeLabel(EDGES[1], 'a', 'b')).toBe(false);
  });
});
