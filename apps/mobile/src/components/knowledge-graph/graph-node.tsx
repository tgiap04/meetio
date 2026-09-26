import { StyleSheet, Text, View } from 'react-native';
import type { EntityType } from '@meetio/shared';
import { getEntityPalette } from './entity-colors';
import { entityTypeLabel } from '../../utils/entity-type-labels';
import { typography } from '../../theme/typography';

export interface GraphNodeData {
  readonly id: string;
  readonly label: string;
  readonly type: EntityType;
}

export interface GraphNodeProps {
  node: GraphNodeData;
  /** Centre point in canvas px, already resolved from the node's stored fraction. */
  x: number;
  y: number;
}

const PILL_WIDTH = 148;
const PILL_HEIGHT = 60;

/** One entity pill, coloured by type (`entity-colors.ts`) — real `MeetingGraphNode`s
 *  have no central/ring distinction from the API, unlike the retired mock
 *  fixture, so every node renders the same shape. */
export function GraphNode({ node, x, y }: GraphNodeProps) {
  const palette = getEntityPalette(node.type);

  return (
    <View style={[styles.pill, { left: x - PILL_WIDTH / 2, top: y - PILL_HEIGHT / 2, backgroundColor: palette.fill }]}>
      <Text numberOfLines={1} style={[typography.label, { color: palette.text }]}>
        {node.label}
      </Text>
      <Text style={[typography.caption, { color: palette.text }]}>{entityTypeLabel(node.type)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 8,
  },
});
