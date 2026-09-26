import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MeetingActionItem } from '@meetio/shared';
import { ActionItemCard } from './action-item-card';
import { SectionHeading } from '../ui/section-heading';
import { AppIcon } from '../icons/app-icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface ActionItemsSectionProps {
  items: readonly MeetingActionItem[];
  onToggle: (id: string) => void;
  onEdit: (item: MeetingActionItem) => void;
  onDelete: (item: MeetingActionItem) => void;
  onOpenTranscript: (segmentSeq: number) => void;
  onAddPress: () => void;
}

/**
 * "Action Items" heading + the persisted list (US-32/33). `items` is trusted
 * to already be open-first/done-last — that ordering is `GET
 * /meetings/:id/actions`'s contract, not something re-derived here.
 */
export function ActionItemsSection({ items, onToggle, onEdit, onDelete, onOpenTranscript, onAddPress }: ActionItemsSectionProps) {
  return (
    <View style={styles.container}>
      <SectionHeading title="Action Items" />
      <View style={styles.list}>
        {items.map((item) => (
          <ActionItemCard
            item={item}
            key={item.id}
            onDelete={onDelete}
            onEdit={onEdit}
            onOpenTranscript={onOpenTranscript}
            onToggle={onToggle}
          />
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={onAddPress} style={styles.addRow}>
        <AppIcon color={colors.primaryStrong} name="plus" size={18} />
        <Text style={styles.addLabel}>Thêm việc</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  list: { gap: 12 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  addLabel: { ...typography.label, color: colors.primaryStrong },
});
