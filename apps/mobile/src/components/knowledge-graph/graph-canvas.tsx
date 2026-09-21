import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GraphEdge } from './graph-edge';
import { GraphNode } from './graph-node';
import { getEntityPalette } from './entity-colors';
import { colors } from '../../theme/colors';
import type { GraphEdge as GraphEdgeData, GraphNode as GraphNodeData, GraphNodeType } from '../../mocks/types';

export interface GraphCanvasProps {
  nodes: readonly GraphNodeData[];
  edges: readonly GraphEdgeData[];
  activeType: GraphNodeType | 'all';
}

/**
 * Each node's centre as a fraction of the canvas (0..1) — presentation, not
 * data, so it lives here rather than in the fixture (Key Insight 2). Read off
 * `design/screen-10-knowledge-graph.png`: two upper pills, the central circle
 * below and between them, two lower pills.
 */
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  'du-an-abc': { x: 0.45, y: 0.57 },
  'nguyen-van-anh': { x: 0.22, y: 0.18 },
  api: { x: 0.73, y: 0.18 },
  'le-thi-mai': { x: 0.2, y: 0.9 },
  authentication: { x: 0.71, y: 0.9 },
};

const CENTRAL_DIAMETER_FRACTION = 0.34;
const CANVAS_HEIGHT = 460;

/**
 * Positions and rotated-`View` edges for the five-node knowledge graph. Sized
 * by `onLayout`, never a hardcoded width, so edges stay attached to their
 * nodes across device widths (the phase's device-rotation success criterion).
 *
 * Filtering hides a node's edges along with the node (Key Insight 5): an edge
 * is drawn only when both its endpoints are in `visibleNodes`. The central
 * Project node is always included, whatever the active filter — otherwise
 * the diagram has nothing to radiate from.
 */
export function GraphCanvas({ nodes, edges, activeType }: GraphCanvasProps) {
  const [canvasWidth, setCanvasWidth] = useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    setCanvasWidth(event.nativeEvent.layout.width);
  }

  const visibleNodes = nodes.filter((node) => node.isCentral || activeType === 'all' || node.type === activeType);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => visibleIds.has(edge.fromId) && visibleIds.has(edge.toId));
  const canvasSize = { width: canvasWidth, height: CANVAS_HEIGHT };

  return (
    <View onLayout={handleLayout} style={styles.canvas} testID="graph-canvas">
      {canvasWidth > 0 &&
        visibleEdges.map((edge) => {
          const from = NODE_POSITIONS[edge.fromId];
          const to = NODE_POSITIONS[edge.toId];
          if (!from || !to) {
            return null;
          }
          const nonCentralNode = nodes.find((node) => node.id === edge.toId && !node.isCentral) ?? nodes.find((node) => node.id === edge.fromId);
          const color = nonCentralNode ? getEntityPalette(nonCentralNode.paletteKey).text : colors.border;
          return <GraphEdge canvasSize={canvasSize} color={color} from={from} key={`${edge.fromId}-${edge.toId}`} to={to} />;
        })}
      {canvasWidth > 0 &&
        visibleNodes.map((node) => {
          const position = NODE_POSITIONS[node.id];
          if (!position) {
            return null;
          }
          const diameter = node.isCentral ? canvasWidth * CENTRAL_DIAMETER_FRACTION : undefined;
          return (
            <GraphNode diameter={diameter} key={node.id} node={node} x={position.x * canvasWidth} y={position.y * CANVAS_HEIGHT} />
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: '100%', height: CANVAS_HEIGHT },
});
