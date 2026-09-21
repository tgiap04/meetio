import { StyleSheet, Text, View } from 'react-native';
import { getEntityPalette } from './entity-colors';
import { typography } from '../../theme/typography';
import type { GraphNode as GraphNodeData, GraphNodeType } from '../../mocks/types';

export interface GraphNodeProps {
  node: GraphNodeData;
  /** Centre point in canvas px, already resolved from the node's stored fraction. */
  x: number;
  y: number;
  /** Central-node circle diameter in px. Ignored for pill nodes. */
  diameter?: number;
}

const PILL_WIDTH = 148;
const PILL_HEIGHT = 60;
const DEFAULT_CENTRAL_DIAMETER = 110;
const CAPTION_DASH_WIDTH = 20;

/** English type caption drawn under a pill node's label ("Person", "Task") —
 *  matches the literal design copy, not localized. The central node's own
 *  caption comes from `node.caption` instead (see `types.ts`). */
const TYPE_CAPTION: Record<GraphNodeType, string> = {
  person: 'Person',
  task: 'Task',
  project: 'Project',
};

/** Central circle or type-coloured pill — the two node variants on screen 10. */
export function GraphNode({ node, x, y, diameter }: GraphNodeProps) {
  const palette = getEntityPalette(node.paletteKey);

  if (node.isCentral) {
    const size = diameter ?? DEFAULT_CENTRAL_DIAMETER;
    return (
      <>
        <View
          style={[
            styles.central,
            { left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: palette.fill },
          ]}
        >
          <Text style={[typography.label, styles.centralLabel, { color: palette.text }]}>{node.label}</Text>
        </View>
        {node.caption ? (
          <>
            <View style={[styles.dash, { left: x + size / 2, top: y - 0.75, backgroundColor: palette.fill }]} />
            <Text style={[typography.caption, styles.dashCaption, { left: x + size / 2 + CAPTION_DASH_WIDTH + 4, top: y - 9 }]}>
              {node.caption}
            </Text>
          </>
        ) : null}
      </>
    );
  }

  return (
    <View style={[styles.pill, { left: x - PILL_WIDTH / 2, top: y - PILL_HEIGHT / 2, backgroundColor: palette.fill }]}>
      <Text style={[typography.label, { color: palette.text }]}>{node.label}</Text>
      <Text style={[typography.caption, { color: palette.text }]}>{TYPE_CAPTION[node.type]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  central: { position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  centralLabel: { textAlign: 'center' },
  dash: { position: 'absolute', width: CAPTION_DASH_WIDTH, height: 1.5 },
  dashCaption: { position: 'absolute' },
  pill: {
    position: 'absolute',
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
