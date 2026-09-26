import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EntitySummary } from '@meetio/shared';
import { getEntityPalette } from '../knowledge-graph/entity-colors';
import { entityTypeLabel } from '../../utils/entity-type-labels';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface EntityListRowProps {
  entity: EntitySummary;
  onPress: () => void;
}

/** One row on the entity-list screen — name, type, and how often it comes up. */
export function EntityListRow({ entity, onPress }: EntityListRowProps) {
  const palette = getEntityPalette(entity.type);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={[styles.typeDot, { backgroundColor: palette.fill }]} />
      <View style={styles.textColumn}>
        <Text numberOfLines={1} style={styles.name}>
          {entity.canonical_name}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {`${entityTypeLabel(entity.type)} · ${entity.mention_count} lượt nhắc · ${entity.meeting_count} cuộc họp`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  typeDot: { width: 12, height: 12, borderRadius: 6 },
  textColumn: { flex: 1, gap: 2 },
  name: { ...typography.label, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
});
