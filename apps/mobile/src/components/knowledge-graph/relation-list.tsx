import { Pressable, StyleSheet, Text } from 'react-native';
import type { MeetingGraphEdge, MeetingGraphNode } from '@meetio/shared';
import { getEntityPalette } from './entity-colors';
import { AppIcon } from '../icons/app-icon';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface RelationListProps {
  relations: readonly MeetingGraphEdge[];
  nodes: readonly MeetingGraphNode[];
  /** Tapping a row opens the transcript at its citation (`chunk_id`'s first
   *  segment, `segment_seq`) — US-38's "chạm để mở transcript". */
  onRelationPress: (edge: MeetingGraphEdge) => void;
  onViewDetailsPress: () => void;
}

/**
 * Subject → verb → object sentence rows built from the real
 * `GET /meetings/:id/graph` edges, each tappable to its citing transcript
 * segment. Replaces the mock build's inert three-row/link version — every
 * row and "Xem chi tiết" now navigate for real (US-38).
 */
export function RelationList({ relations, nodes, onRelationPress, onViewDetailsPress }: RelationListProps) {
  function findNode(id: string) {
    return nodes.find((node) => node.id === id);
  }

  return (
    <SurfaceCard>
      {relations.length === 0 ? (
        <Text style={styles.empty}>Chưa có quan hệ nào được trích xuất cho cuộc họp này.</Text>
      ) : (
        relations.map((relation) => {
          const subject = findNode(relation.source_id);
          const object = findNode(relation.target_id);
          return (
            <Pressable
              accessibilityRole="button"
              key={`${relation.source_id}-${relation.target_id}-${relation.relationship}`}
              onPress={() => onRelationPress(relation)}
              style={styles.row}
            >
              <AppIcon color={colors.primaryStrong} name="clock" size={16} />
              <Text style={styles.sentence}>
                <Text style={{ color: subject ? getEntityPalette(subject.type).text : colors.text }}>
                  {subject?.canonical_name ?? relation.source_id}
                </Text>
                <Text style={styles.verb}>{` → ${relation.relationship} → `}</Text>
                <Text style={{ color: object ? getEntityPalette(object.type).text : colors.text }}>
                  {object?.canonical_name ?? relation.target_id}
                </Text>
              </Text>
            </Pressable>
          );
        })
      )}
      <Pressable accessibilityRole="button" onPress={onViewDetailsPress}>
        <Text style={styles.link}>Xem chi tiết</Text>
      </Pressable>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  sentence: { ...typography.body, flex: 1 },
  verb: { color: colors.textMuted },
  empty: { ...typography.body, color: colors.textMuted, paddingVertical: 8 },
  link: { ...typography.label, color: colors.primaryStrong, textAlign: 'right', marginTop: 4 },
});
