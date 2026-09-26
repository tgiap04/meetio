import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { MeetingGraphEdge, MeetingGraphNode } from '@meetio/shared';
import { GraphEdge } from './graph-edge';
import { GraphNode } from './graph-node';
import { getEntityPalette } from './entity-colors';
import { computeCircularLayout } from './compute-circular-layout';
import { colors } from '../../theme/colors';

export interface GraphCanvasProps {
  /** Already filtered/capped by `selectVisibleGraphNodes` — the first entry
   *  becomes the layout's centre. */
  nodes: readonly MeetingGraphNode[];
  edges: readonly MeetingGraphEdge[];
}

const CANVAS_HEIGHT = 460;

/**
 * Real-data replacement for the mock build's five-fixed-position canvas.
 * Positions come from `computeCircularLayout` (arbitrary node count) instead
 * of a hand-placed lookup table; sized by `onLayout`, never a hardcoded
 * width, so edges stay attached to their nodes across device widths.
 */
export function GraphCanvas({ nodes, edges }: GraphCanvasProps) {
  const [canvasWidth, setCanvasWidth] = useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    setCanvasWidth(event.nativeEvent.layout.width);
  }

  const layout = computeCircularLayout(nodes.map((node) => node.id));
  const canvasSize = { width: canvasWidth, height: CANVAS_HEIGHT };

  function edgeColor(edge: MeetingGraphEdge): string {
    const other = nodes.find((node) => node.id === edge.target_id) ?? nodes.find((node) => node.id === edge.source_id);
    return other ? getEntityPalette(other.type).text : colors.border;
  }

  return (
    <View onLayout={handleLayout} style={styles.canvas} testID="graph-canvas">
      {canvasWidth > 0 &&
        edges.map((edge) => {
          const from = layout.get(edge.source_id);
          const to = layout.get(edge.target_id);
          if (!from || !to) {
            return null;
          }
          return (
            <GraphEdge
              canvasSize={canvasSize}
              color={edgeColor(edge)}
              from={from}
              key={`${edge.source_id}-${edge.target_id}-${edge.relationship}`}
              to={to}
            />
          );
        })}
      {canvasWidth > 0 &&
        nodes.map((node) => {
          const position = layout.get(node.id);
          if (!position) {
            return null;
          }
          return (
            <GraphNode
              key={node.id}
              node={{ id: node.id, label: node.canonical_name, type: node.type }}
              x={position.x * canvasWidth}
              y={position.y * CANVAS_HEIGHT}
            />
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: '100%', height: CANVAS_HEIGHT },
});
