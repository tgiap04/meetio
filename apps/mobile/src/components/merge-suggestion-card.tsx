import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EntitySummary, MergeSuggestion } from '@meetio/shared';
import { getEntityPalette } from './knowledge-graph/entity-colors';
import { SurfaceCard } from './ui/surface-card';
import { entityTypeLabel } from '../utils/entity-type-labels';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export interface MergeSuggestionCardProps {
  suggestion: MergeSuggestion;
  /** `keep` names which of `a`/`b` survives the merge — "Gộp" always keeps
   *  the entity the user tapped and merges the other into it (US-41). */
  onMergePress: (keep: EntitySummary, mergeAway: EntitySummary) => void;
  onRejectPress: () => void;
}

function EntityColumn({ entity, onPress }: { entity: EntitySummary; onPress: () => void }) {
  const palette = getEntityPalette(entity.type);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.column}>
      <View style={[styles.dot, { backgroundColor: palette.fill }]} />
      <Text numberOfLines={1} style={styles.name}>
        {entity.canonical_name}
      </Text>
      <Text style={styles.meta}>{entityTypeLabel(entity.type)}</Text>
      <Text style={styles.keepLabel}>Giữ lại</Text>
    </Pressable>
  );
}

/** One `GET /entities/merge-suggestions` row (US-41) — the two candidate
 *  entities side by side with their similarity score, "Gộp" (tapping either
 *  column keeps that one) or "Không trùng" to reject. */
export function MergeSuggestionCard({ suggestion, onMergePress, onRejectPress }: MergeSuggestionCardProps) {
  return (
    <SurfaceCard>
      <Text style={styles.score}>{`Độ giống: ${Math.round(suggestion.score * 100)}%`}</Text>
      <View style={styles.pair}>
        <EntityColumn entity={suggestion.a} onPress={() => onMergePress(suggestion.a, suggestion.b)} />
        <Text style={styles.versus}>vs</Text>
        <EntityColumn entity={suggestion.b} onPress={() => onMergePress(suggestion.b, suggestion.a)} />
      </View>
      <Pressable accessibilityRole="button" onPress={onRejectPress} style={styles.rejectButton}>
        <Text style={styles.rejectLabel}>Không trùng</Text>
      </Pressable>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  score: { ...typography.caption, color: colors.textMuted, marginBottom: 8 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  column: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  name: { ...typography.label, color: colors.text, textAlign: 'center' },
  meta: { ...typography.caption, color: colors.textMuted },
  keepLabel: { ...typography.caption, fontWeight: '600', color: colors.primaryStrong },
  versus: { ...typography.caption, color: colors.textMuted },
  rejectButton: { alignItems: 'center', paddingVertical: 10, marginTop: 8 },
  rejectLabel: { ...typography.caption, fontWeight: '600', color: colors.danger },
});
