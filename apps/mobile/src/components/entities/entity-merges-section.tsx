import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EntityMergeRecord } from '@meetio/shared';
import { AppIcon } from '../icons/app-icon';
import { SurfaceCard } from '../ui/surface-card';
import { SectionHeading } from '../ui/section-heading';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface EntityMergesSectionProps {
  merges: readonly EntityMergeRecord[];
  onUndoPress: (merge: EntityMergeRecord) => void;
  /** `merge.id`s currently undoing — disables that row's button so a double
   *  tap cannot fire two undo requests for the same merge. */
  undoingIds: ReadonlySet<string>;
}

/** The entity-detail screen's "Đã gộp" section (US-41) — every merge into
 *  this entity that is still inside its 30-day undo window. */
export function EntityMergesSection({ merges, onUndoPress, undoingIds }: EntityMergesSectionProps) {
  if (merges.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <SectionHeading title="Đã gộp" />
      <SurfaceCard>
        {merges.map((merge) => (
          <View key={merge.id} style={styles.row}>
            <Text numberOfLines={1} style={styles.name}>
              {merge.merged_name}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={undoingIds.has(merge.id)}
              onPress={() => onUndoPress(merge)}
              style={styles.undoButton}
            >
              <AppIcon color={colors.primaryStrong} name="undo" size={16} />
              <Text style={styles.undoLabel}>Hoàn tác</Text>
            </Pressable>
          </View>
        ))}
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  name: { ...typography.body, color: colors.text, flex: 1 },
  undoButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  undoLabel: { ...typography.caption, fontWeight: '600', color: colors.primaryStrong },
});
