import { Pressable, StyleSheet, Text } from 'react-native';
import type { QaCitation } from '@meetio/shared';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { formatCitationDate } from '../utils/qa-formatting';

export interface CitationChipProps {
  citation: QaCitation;
  onPress: (citation: QaCitation) => void;
}

/**
 * One citation on a Q&A answer (US-36): meeting title + `dd/MM`, tap to jump
 * the transcript to `segment_seq`. `available: false` means the cited
 * passage no longer exists — the transcript was edited and re-cut since — so
 * the chip renders as a disabled notice instead of a live tap target.
 */
export function CitationChip({ citation, onPress }: CitationChipProps) {
  if (!citation.available) {
    return (
      <Text style={styles.disabledChip} testID={`citation-chip-${citation.chunk_id}`}>
        {citation.meeting_title} · đoạn này đã thay đổi
      </Text>
    );
  }

  return (
    <Pressable
      accessibilityLabel={`${citation.meeting_title}, ${formatCitationDate(citation.meeting_date)}`}
      accessibilityRole="button"
      onPress={() => onPress(citation)}
      style={styles.chip}
      testID={`citation-chip-${citation.chunk_id}`}
    >
      <Text style={styles.chipText}>
        {citation.meeting_title} · {formatCitationDate(citation.meeting_date)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.primaryTint,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { ...typography.caption, color: colors.primaryStrong },
  disabledChip: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
});
