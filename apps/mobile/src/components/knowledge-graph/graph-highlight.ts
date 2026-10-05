/**
 * Tap-to-highlight rules for the knowledge-graph canvas (screen 10), kept
 * pure so the selection behaviour is unit-tested apart from rendering.
 * Selection lives in the screen; the canvas and the relation list read it.
 */
import type { MeetingGraphEdge } from '@meetio/shared';

/** Opacity of nodes (and multiplier for edges) outside the selected node's neighbourhood. */
export const DIMMED_OPACITY = 0.3;

export type NodeEmphasis = 'normal' | 'selected' | 'related' | 'dimmed';
export type EdgeEmphasis = 'normal' | 'active' | 'dimmed';

/** Tapping the selected node again clears; tapping another switches. */
export function toggleNodeSelection(current: string | null, tapped: string): string | null {
  return current === tapped ? null : tapped;
}

export function edgeTouchesNode(edge: MeetingGraphEdge, nodeId: string): boolean {
  return edge.source_id === nodeId || edge.target_id === nodeId;
}

/** Relations involving the selected node; all of them when nothing is selected. */
export function filterRelationsForNode(
  relations: readonly MeetingGraphEdge[],
  nodeId: string | null,
): readonly MeetingGraphEdge[] {
  if (nodeId === null) {
    return relations;
  }
  return relations.filter((relation) => edgeTouchesNode(relation, nodeId));
}

export function collectNeighborIds(edges: readonly MeetingGraphEdge[], nodeId: string | null): ReadonlySet<string> {
  const neighbors = new Set<string>();
  if (nodeId === null) {
    return neighbors;
  }
  for (const edge of edges) {
    if (edge.source_id === nodeId) {
      neighbors.add(edge.target_id);
    } else if (edge.target_id === nodeId) {
      neighbors.add(edge.source_id);
    }
  }
  return neighbors;
}

export function getNodeEmphasis(
  nodeId: string,
  selectedId: string | null,
  neighborIds: ReadonlySet<string>,
): NodeEmphasis {
  if (selectedId === null) {
    return 'normal';
  }
  if (nodeId === selectedId) {
    return 'selected';
  }
  return neighborIds.has(nodeId) ? 'related' : 'dimmed';
}

export function getEdgeEmphasis(edge: MeetingGraphEdge, selectedId: string | null): EdgeEmphasis {
  if (selectedId === null) {
    return 'normal';
  }
  return edgeTouchesNode(edge, selectedId) ? 'active' : 'dimmed';
}

/** Labels stay sparse to avoid clutter: the center's edges by default, the
 *  selected node's edges while something is selected. */
export function shouldShowEdgeLabel(edge: MeetingGraphEdge, centerId: string, selectedId: string | null): boolean {
  return edgeTouchesNode(edge, selectedId ?? centerId);
}
