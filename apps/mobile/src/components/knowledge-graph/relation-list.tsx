import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MeetingGraphEdge, MeetingGraphNode } from '@meetio/shared';
import { getEntityPalette } from './entity-colors';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface RelationListProps {
  /** Already narrowed to the selected node's relations by the screen. */
  relations: readonly MeetingGraphEdge[];
  nodes: readonly MeetingGraphNode[];
  /** Tapping a row opens the transcript at its citation (`chunk_id`'s first
   *  segment, `segment_seq`) — US-38's "chạm để mở transcript". */
  onRelationPress: (edge: MeetingGraphEdge) => void;
  onViewDetailsPress: () => void;
  /** Name of the node selected on the canvas; shows the "Quan hệ của …" header. */
  selectedNodeName?: string | null;
  onClearSelection?: () => void;
}

/**
 * "○ A → quan hệ → B" rows built from the real `GET /meetings/:id/graph`
 * edges, each tappable to its citing transcript segment (US-38). While a
 * canvas node is selected, a header names it and offers "Bỏ chọn".
 */
export function RelationList({
  relations,
  nodes,
  onRelationPress,
  onViewDetailsPress,
  selectedNodeName,
  onClearSelection,
}: RelationListProps) {
  function findNode(id: string) {
    return nodes.find((node) => node.id === id);
  }

  function nameColor(node: MeetingGraphNode | undefined) {
    return { color: node ? getEntityPalette(node.type).text : colors.text };
  }

  const emptyMessage = selectedNodeName
    ? 'Thực thể này chưa có quan hệ nào.'
    : 'Chưa có quan hệ nào được trích xuất cho cuộc họp này.';

  return (
    <SurfaceCard>
      {selectedNodeName ? (
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            Quan hệ của {selectedNodeName}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onClearSelection} style={styles.clear}>
            <Text style={styles.clearText}>Bỏ chọn</Text>
          </Pressable>
        </View>
      ) : null}
      {relations.length === 0 ? (
        <Text style={styles.empty}>{emptyMessage}</Text>
      ) : (
        relations.map((relation, index) => {
          const subject = findNode(relation.source_id);
          const object = findNode(relation.target_id);
          return (
            <Pressable
              accessibilityRole="button"
              key={`${relation.source_id}-${relation.target_id}-${relation.relationship}-${index}`}
              onPress={() => onRelationPress(relation)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.bullet} />
              <Text style={styles.sentence}>
                <Text style={nameColor(subject)}>{subject?.canonical_name ?? relation.source_id}</Text>
                <Text style={styles.verb}>{` → ${relation.relationship} → `}</Text>
                <Text style={nameColor(object)}>{object?.canonical_name ?? relation.target_id}</Text>
              </Text>
            </Pressable>
          );
        })
      )}
      <Pressable accessibilityRole="button" onPress={onViewDetailsPress} style={styles.link}>
        <Text style={styles.linkText}>Xem chi tiết</Text>
        <Text style={styles.linkText}>›</Text>
      </Pressable>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  headerTitle: { ...typography.label, color: colors.text, flex: 1 },
  clear: { minHeight: 44, justifyContent: 'center' },
  clearText: { ...typography.label, color: colors.primaryStrong },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 6 },
  rowPressed: { opacity: 0.6 },
  bullet: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: colors.primaryStrong },
  sentence: { ...typography.body, fontSize: 15, lineHeight: 22, flex: 1 },
  verb: { color: colors.textMuted },
  empty: { ...typography.body, color: colors.textMuted, paddingVertical: 8 },
  link: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 4, minHeight: 44 },
  linkText: { ...typography.label, color: colors.primaryStrong },
});
