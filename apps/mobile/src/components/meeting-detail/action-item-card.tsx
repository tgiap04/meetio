import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/app-icon';
import { SurfaceCard } from '../ui/surface-card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { ActionItem } from '../../mocks/types';

export interface ActionItemCardProps {
  item: ActionItem;
  checked: boolean;
  onToggle: (id: string) => void;
}

/**
 * One action-item row: a tappable checkbox (drawn empty in the design — see
 * clarifications, toggling it is a local, non-persisted UI response and
 * invents no data), the title, and an "assignee · due date" meta line.
 */
export function ActionItemCard({ item, checked, onToggle }: ActionItemCardProps) {
  return (
    <SurfaceCard style={styles.card}>
      <Pressable
        accessibilityLabel={`${item.title}, ${checked ? 'đã hoàn thành' : 'chưa hoàn thành'}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        hitSlop={8}
        onPress={() => onToggle(item.id)}
        testID={`action-item-checkbox-${item.id}`}
      >
        <AppIcon color={checked ? colors.primaryStrong : colors.textMuted} name={checked ? 'checkCircle' : 'circle'} size={22} />
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.meta}>
          {item.assignee} · {item.due}
        </Text>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, gap: 2 },
  title: { ...typography.label, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
});
