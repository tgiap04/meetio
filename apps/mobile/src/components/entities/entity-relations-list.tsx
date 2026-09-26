import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EntityRelation } from '@meetio/shared';
import { getEntityPalette } from '../knowledge-graph/entity-colors';
import { SurfaceCard } from '../ui/surface-card';
import { SectionHeading } from '../ui/section-heading';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface EntityRelationsListProps {
  entityName: string;
  entityType: EntityRelation['other']['type'];
  relations: readonly EntityRelation[];
  /** Opens the citing meeting's transcript at the relation's segment (US-38). */
  onRelationPress: (relation: EntityRelation) => void;
}

/** The entity-detail screen's "Quan hệ" section — every observed relation
 *  involving this entity, oriented by `direction` so the sentence always
 *  reads subject → verb → object regardless of which side this entity was on. */
export function EntityRelationsList({ entityName, entityType, relations, onRelationPress }: EntityRelationsListProps) {
  if (relations.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <SectionHeading title="Quan hệ" />
      <SurfaceCard>
        {relations.map((relation) => {
          const isOutgoing = relation.direction === 'outgoing';
          const subjectName = isOutgoing ? entityName : relation.other.canonical_name;
          const objectName = isOutgoing ? relation.other.canonical_name : entityName;
          const subjectColor = getEntityPalette(isOutgoing ? entityType : relation.other.type).text;
          const objectColor = getEntityPalette(isOutgoing ? relation.other.type : entityType).text;

          return (
            <Pressable
              accessibilityRole="button"
              key={relation.id}
              onPress={() => onRelationPress(relation)}
              style={styles.row}
            >
              <Text style={styles.sentence}>
                <Text style={{ color: subjectColor }}>{subjectName}</Text>
                <Text style={styles.verb}>{` → ${relation.relationship} → `}</Text>
                <Text style={{ color: objectColor }}>{objectName}</Text>
              </Text>
              <Text style={styles.meetingTitle}>{relation.meeting_title}</Text>
            </Pressable>
          );
        })}
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: { paddingVertical: 8, gap: 2 },
  sentence: { ...typography.body },
  verb: { color: colors.textMuted },
  meetingTitle: { ...typography.caption, color: colors.textMuted },
});
