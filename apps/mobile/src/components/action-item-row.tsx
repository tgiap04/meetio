import { Pressable, StyleSheet, Text } from 'react-native';
import type { ActionListItem } from '@meetio/shared';
import { ActionStatus } from '@meetio/shared';
import { AppIcon } from './icons/app-icon';
import { SurfaceCard } from './ui/surface-card';
import { formatDueDateDisplay } from '../utils/action-item-format';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export interface ActionItemRowProps {
  item: ActionListItem;
  onToggle: (id: string) => void;
  onPress: (meetingId: string) => void;
}

/**
 * One row on the "Việc cần làm" cross-meeting screen (US-34): content, an
 * "assignee · due date" meta line (blank parts omitted, never guessed), and
 * which meeting it came from — tapping the row (outside the checkbox) opens
 * that meeting's detail screen. The checkbox persists here too, the same
 * PATCH as the meeting-detail Action Items tab.
 */
export function ActionItemRow({ item, onToggle, onPress }: ActionItemRowProps) {
  const checked = item.status === ActionStatus.DONE;
  const dueDisplay = formatDueDateDisplay(item.due_date);
  const metaParts = [item.assignee_name, dueDisplay].filter((part): part is string => Boolean(part));

  return (
    <SurfaceCard style={styles.card}>
      <Pressable
        accessibilityLabel={`${item.content}, ${checked ? 'đã hoàn thành' : 'chưa hoàn thành'}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        hitSlop={8}
        onPress={() => onToggle(item.id)}
        testID={`action-item-row-checkbox-${item.id}`}
      >
        <AppIcon color={checked ? colors.primaryStrong : colors.textMuted} name={checked ? 'checkCircle' : 'circle'} size={22} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => onPress(item.meeting_id)} style={styles.body}>
        <Text style={[styles.title, checked && styles.titleDone]}>{item.content}</Text>
        {metaParts.length > 0 ? <Text style={styles.meta}>{metaParts.join(' · ')}</Text> : null}
        <Text numberOfLines={1} style={styles.meetingMeta}>
          {item.meeting_title}
          {item.meeting_date ? ` · ${item.meeting_date}` : ''}
        </Text>
      </Pressable>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, gap: 2 },
  title: { ...typography.label, color: colors.text },
  titleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  meta: { ...typography.caption, color: colors.textMuted },
  meetingMeta: { ...typography.caption, color: colors.primaryStrong },
});
