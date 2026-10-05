/**
 * Turns visible graph edges into drawable items: segments trimmed to the
 * node outlines, an emphasis for tap-to-highlight, and an optional relation
 * label. Pure — `graph-canvas.tsx` only maps the result to Views.
 */
import type { MeetingGraphEdge } from '@meetio/shared';
import { computeEdgeGeometry, trimSegmentToShapes, type NodeShape, type Point } from './compute-edge-geometry';
import { PILL_HEIGHT, type GraphLayout } from './compute-graph-layout';
import { getEdgeEmphasis, shouldShowEdgeLabel, type EdgeEmphasis } from './graph-highlight';

/** Below this visible length a label chip would sit on top of the nodes. */
const MIN_LABELLED_SEGMENT = 40;

export interface GraphEdgeSceneItem {
  readonly key: string;
  readonly from: Point;
  readonly to: Point;
  readonly emphasis: EdgeEmphasis;
  readonly label: { readonly text: string; readonly at: Point; readonly active: boolean } | null;
}

interface PlacedNode {
  readonly point: Point;
  readonly shape: NodeShape;
}

function placeNodes(layout: GraphLayout, measuredWidths: ReadonlyMap<string, number>): Map<string, PlacedNode> {
  const placed = new Map<string, PlacedNode>();
  if (layout.center) {
    placed.set(layout.center.id, { point: layout.center, shape: { kind: 'circle', radius: layout.center.diameter / 2 } });
  }
  for (const slot of layout.ring) {
    // Until a pill reports its width, assume the narrowest pill (a 44pt
    // circle) so the line ends under the pill rather than short of it.
    const width = measuredWidths.get(slot.id) ?? PILL_HEIGHT;
    placed.set(slot.id, { point: slot, shape: { kind: 'rect', halfWidth: width / 2, halfHeight: PILL_HEIGHT / 2 } });
  }
  return placed;
}

export function buildGraphEdgeScene(
  edges: readonly MeetingGraphEdge[],
  layout: GraphLayout,
  measuredWidths: ReadonlyMap<string, number>,
  selectedId: string | null,
): GraphEdgeSceneItem[] {
  const placed = placeNodes(layout, measuredWidths);
  const labelledPairs = new Set<string>();
  const items: GraphEdgeSceneItem[] = [];

  edges.forEach((edge, index) => {
    const source = placed.get(edge.source_id);
    const target = placed.get(edge.target_id);
    if (!source || !target || !layout.center) {
      return;
    }
    const segment = trimSegmentToShapes(source.point, source.shape, target.point, target.shape);
    if (!segment) {
      return;
    }
    const emphasis = getEdgeEmphasis(edge, selectedId);
    const { length, midpoint } = computeEdgeGeometry(segment.from, segment.to);
    const pairKey = [edge.source_id, edge.target_id].sort().join('|');
    const wantsLabel =
      shouldShowEdgeLabel(edge, layout.center.id, selectedId) &&
      length >= MIN_LABELLED_SEGMENT &&
      !labelledPairs.has(pairKey);
    if (wantsLabel) {
      labelledPairs.add(pairKey);
    }
    items.push({
      key: `${edge.source_id}-${edge.target_id}-${edge.relationship}-${index}`,
      from: segment.from,
      to: segment.to,
      emphasis,
      label: wantsLabel ? { text: edge.relationship, at: midpoint, active: emphasis === 'active' } : null,
    });
  });

  return items;
}
