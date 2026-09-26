import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MeetingActionItem } from '@meetio/shared';
import { ActionStatus } from '@meetio/shared';
import { AppIcon } from '../icons/app-icon';
import { SurfaceCard } from '../ui/surface-card';
import { formatDueDateDisplay } from '../../utils/action-item-format';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface ActionItemCardProps {
  item: MeetingActionItem;
  onToggle: (id: string) => void;
  onEdit: (item: MeetingActionItem) => void;
  onDelete: (item: MeetingActionItem) => void;
  onOpenTranscript: (segmentSeq: number) => void;
}

/**
 * One persisted action item (US-32/33): a tappable checkbox that PATCHes
 * `status`, the content, an "assignee · due date" meta line built from only
 * the fields that are actually set (never a guessed placeholder — a blank
 * `assignee_name` stays blank), an edit and a delete affordance, and — when
 * the item still has a `segment_seq` — tapping the body opens the transcript
 * there.
 */
export function ActionItemCard({ item, onToggle, onEdit, onDelete, onOpenTranscript }: ActionItemCardProps) {
  const checked = item.status === ActionStatus.DONE;
  const dueDisplay = formatDueDateDisplay(item.due_date);
  const metaParts = [item.assignee_name, dueDisplay].filter((part): part is string => Boolean(part));

  function handleBodyPress() {
    if (item.segment_seq !== null) {
      onOpenTranscript(item.segment_seq);
    }
  }

  const body = (
    <View style={styles.body}>
      <Text style={[styles.title, checked && styles.titleDone]}>{item.content}</Text>
      {metaParts.length > 0 ? <Text style={styles.meta}>{metaParts.join(' · ')}</Text> : null}
    </View>
  );

  return (
    <SurfaceCard style={styles.card}>
      <Pressable
        accessibilityLabel={`${item.content}, ${checked ? 'đã hoàn thành' : 'chưa hoàn thành'}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        hitSlop={8}
        onPress={() => onToggle(item.id)}
        testID={`action-item-checkbox-${item.id}`}
      >
        <AppIcon color={checked ? colors.primaryStrong : colors.textMuted} name={checked ? 'checkCircle' : 'circle'} size={22} />
      </Pressable>
      {item.segment_seq !== null ? (
        <Pressable
          accessibilityRole="button"
          onPress={handleBodyPress}
          style={styles.bodyPressable}
          testID={`action-item-body-${item.id}`}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      <Pressable accessibilityLabel="Sửa việc cần làm" accessibilityRole="button" hitSlop={8} onPress={() => onEdit(item)}>
        <AppIcon color={colors.textMuted} name="edit" size={18} />
      </Pressable>
      <Pressable accessibilityLabel="Xóa việc cần làm" accessibilityRole="button" hitSlop={8} onPress={() => onDelete(item)}>
        <AppIcon color={colors.textMuted} name="trash" size={18} />
      </Pressable>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bodyPressable: { flex: 1 },
  body: { flex: 1, gap: 2 },
  title: { ...typography.label, color: colors.text },
  titleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  meta: { ...typography.caption, color: colors.textMuted },
});
