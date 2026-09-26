import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EntityDetail } from '@meetio/shared';
import { AppIcon } from '../icons/app-icon';
import { SurfaceCard } from '../ui/surface-card';
import { entityTypeLabel } from '../../utils/entity-type-labels';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface EntityHeaderCardProps {
  entity: EntityDetail;
  onEditPress: () => void;
  onDeletePress: () => void;
}

/** The entity-detail screen's top card — name, type, aliases, and the
 *  edit/delete affordances (US-38, US-40). No "hỏi trong phạm vi thực thể"
 *  Q&A entry here — that is deferred to Phase 15 per clarifications.md. */
export function EntityHeaderCard({ entity, onEditPress, onDeletePress }: EntityHeaderCardProps) {
  return (
    <SurfaceCard>
      <View style={styles.row}>
        <View style={styles.textColumn}>
          <Text style={styles.name}>{entity.canonical_name}</Text>
          <Text style={styles.type}>{entityTypeLabel(entity.type)}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityLabel="Sửa thực thể" accessibilityRole="button" hitSlop={8} onPress={onEditPress}>
            <AppIcon color={colors.textMuted} name="edit" size={20} />
          </Pressable>
          <Pressable accessibilityLabel="Xóa thực thể" accessibilityRole="button" hitSlop={8} onPress={onDeletePress}>
            <AppIcon color={colors.danger} name="trash" size={20} />
          </Pressable>
        </View>
      </View>
      {entity.aliases.length > 0 ? (
        <Text style={styles.aliases}>{`Còn gọi là: ${entity.aliases.join(', ')}`}</Text>
      ) : null}
      {entity.description ? <Text style={styles.description}>{entity.description}</Text> : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  textColumn: { flex: 1, gap: 2 },
  name: { ...typography.heading, color: colors.text },
  type: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 16 },
  aliases: { ...typography.caption, color: colors.textMuted, marginTop: 8 },
  description: { ...typography.body, color: colors.text, marginTop: 8 },
});
