/**
 * Filters a real `GET /meetings/:id/graph` response down to what the canvas
 * can draw. Unlike the retired five-node mock fixture, a real meeting can
 * cite far more entities than a hand-placed circular layout stays legible
 * for — so this caps the node count, biased toward the entities mentioned
 * most, and reports how many it dropped so the screen can say so (the task's
 * "handle more nodes than the fixture" requirement).
 */
import type { MeetingGraphEdge, MeetingGraphNode } from '@meetio/shared';
import { entityTypeToChipKey, type EntityChipKey } from '../../utils/entity-type-labels';

/** Chosen to stay legible on a phone-width circular layout. */
export const MAX_GRAPH_NODES = 12;

export interface VisibleGraph {
  /** Sorted by `mention_count` descending — the first entry is the node
   *  `GraphCanvas` treats as the layout's centre. */
  readonly nodes: readonly MeetingGraphNode[];
  /** Only edges whose both endpoints survived the filter/cap. */
  readonly edges: readonly MeetingGraphEdge[];
  /** How many nodes the chip filter matched but the cap dropped. */
  readonly hiddenCount: number;
}

export function selectVisibleGraphNodes(
  nodes: readonly MeetingGraphNode[],
  edges: readonly MeetingGraphEdge[],
  chip: EntityChipKey,
): VisibleGraph {
  const filtered = chip === 'all' ? nodes : nodes.filter((node) => entityTypeToChipKey(node.type) === chip);
  const sorted = [...filtered].sort((a, b) => b.mention_count - a.mention_count);
  const capped = sorted.slice(0, MAX_GRAPH_NODES);
  const visibleIds = new Set(capped.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => visibleIds.has(edge.source_id) && visibleIds.has(edge.target_id));

  return {
    nodes: capped,
    edges: visibleEdges,
    hiddenCount: sorted.length - capped.length,
  };
}
