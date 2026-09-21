import { StyleSheet, Text, View } from 'react-native';
import { getEntityPalette } from './entity-colors';
import { AppIcon } from '../icons/app-icon';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { GraphNode, GraphRelation } from '../../mocks/types';

export interface RelationListProps {
  relations: readonly GraphRelation[];
  nodes: readonly GraphNode[];
}

/**
 * Three subject → verb → object sentence rows plus the "Xem chi tiết" link.
 * Both the rows and the link are read-only per the design crop — the phase's
 * hard constraints call the link out explicitly as **deliberately inert**,
 * and the rows carry no tap target either (no entity in the crop looks like
 * a control, unlike the coloured-but-static entity names it uses to signal
 * type at a glance).
 */
export function RelationList({ relations, nodes }: RelationListProps) {
  function findNode(id: string) {
    return nodes.find((node) => node.id === id);
  }

  return (
    <SurfaceCard>
      {relations.map((relation) => {
        const subject = findNode(relation.subjectId);
        const object = findNode(relation.objectId);
        return (
          <View key={relation.id} style={styles.row}>
            <AppIcon color={colors.primaryStrong} name="clock" size={16} />
            <Text style={styles.sentence}>
              <Text style={{ color: subject ? getEntityPalette(subject.paletteKey).text : colors.text }}>
                {subject?.label ?? relation.subjectId}
              </Text>
              <Text style={styles.verb}>{` → ${relation.verb} → `}</Text>
              <Text style={{ color: object ? getEntityPalette(object.paletteKey).text : colors.text }}>
                {object?.label ?? relation.objectId}
              </Text>
            </Text>
          </View>
        );
      })}
      <Text style={styles.link}>Xem chi tiết</Text>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  sentence: { ...typography.body, flex: 1 },
  verb: { color: colors.textMuted },
  link: { ...typography.label, color: colors.primaryStrong, textAlign: 'right', marginTop: 4 },
});
