import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { MeetingGraphEdge, MeetingGraphNode } from '@meetio/shared';
import { GraphEdge } from './graph-edge';
import { GraphEdgeLabel } from './graph-edge-label';
import { GraphNode, type GraphNodeData } from './graph-node';
import { computeGraphLayout } from './compute-graph-layout';
import { buildGraphEdgeScene } from './build-graph-edge-scene';
import { collectNeighborIds, getNodeEmphasis } from './graph-highlight';
import { colors } from '../../theme/colors';

export interface GraphCanvasProps {
  /** Already filtered/capped by `selectVisibleGraphNodes` — the first entry
   *  (most mentioned) becomes the center circle. */
  nodes: readonly MeetingGraphNode[];
  edges: readonly MeetingGraphEdge[];
  selectedId: string | null;
  onNodePress: (nodeId: string) => void;
  /** Tap on empty canvas — clears the selection. */
  onBackgroundPress: () => void;
}

export const CANVAS_HEIGHT = 380;
const CARD_BORDER = 1;

function toNodeData(node: MeetingGraphNode): GraphNodeData {
  return { id: node.id, label: node.canonical_name, type: node.type, mentionCount: node.mention_count };
}

/**
 * Screen 10's diagram card. Sized by `onLayout` (never a hardcoded width);
 * positions come from `computeGraphLayout` in points, edges from
 * `buildGraphEdgeScene`. Layering, bottom to top: background tap target,
 * edges, edge labels, nodes.
 */
export function GraphCanvas({ nodes, edges, selectedId, onNodePress, onBackgroundPress }: GraphCanvasProps) {
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [pillWidths, setPillWidths] = useState<ReadonlyMap<string, number>>(new Map());

  function handleLayout(event: LayoutChangeEvent) {
    setCanvasWidth(event.nativeEvent.layout.width);
  }

  function handlePillWidth(nodeId: string, width: number) {
    setPillWidths((current) => (current.get(nodeId) === width ? current : new Map(current).set(nodeId, width)));
  }

  // Absolute children are laid out inside the card's border.
  const size = { width: Math.max(0, canvasWidth - CARD_BORDER * 2), height: CANVAS_HEIGHT - CARD_BORDER * 2 };
  const layout = computeGraphLayout(
    nodes.map((node) => node.id),
    size,
  );
  const scene = buildGraphEdgeScene(edges, layout, pillWidths, selectedId);
  const neighborIds = collectNeighborIds(edges, selectedId);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const centerNode = layout.center ? nodeById.get(layout.center.id) : undefined;

  return (
    <View onLayout={handleLayout} style={styles.card} testID="graph-canvas">
      {layout.center && centerNode ? (
        <>
          <Pressable
            accessible={false}
            onPress={onBackgroundPress}
            style={StyleSheet.absoluteFill}
            testID="graph-canvas-background"
          />
          {scene.map((item) => (
            <GraphEdge emphasis={item.emphasis} from={item.from} key={item.key} to={item.to} />
          ))}
          {scene.map((item) =>
            item.label ? (
              <GraphEdgeLabel active={item.label.active} at={item.label.at} key={item.key} label={item.label.text} />
            ) : null,
          )}
          <GraphNode
            diameter={layout.center.diameter}
            emphasis={getNodeEmphasis(centerNode.id, selectedId, neighborIds)}
            node={toNodeData(centerNode)}
            onPress={onNodePress}
            variant="center"
            x={layout.center.x}
            y={layout.center.y}
          />
          {layout.ring.map((slot) => {
            const node = nodeById.get(slot.id);
            return node ? (
              <GraphNode
                emphasis={getNodeEmphasis(node.id, selectedId, neighborIds)}
                key={node.id}
                maxWidth={slot.maxWidth}
                node={toNodeData(node)}
                onPress={onNodePress}
                onWidthMeasured={handlePillWidth}
                variant="ring"
                x={slot.x}
                y={slot.y}
              />
            ) : null;
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    height: CANVAS_HEIGHT,
    borderRadius: 16,
    borderWidth: CARD_BORDER,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
});
