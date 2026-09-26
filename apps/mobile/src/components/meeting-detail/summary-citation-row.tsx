import { Pressable, StyleSheet, Text } from 'react-native';
import type { SummaryCitation } from '@meetio/shared';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface SummaryCitationRowProps {
  citation: SummaryCitation;
  onPress: (segmentSeq: number) => void;
}

/** One cited line of the summary (a point or a decision) — tapping it jumps
 *  the transcript to `citation.segment_seq` (US-31). */
export function SummaryCitationRow({ citation, onPress }: SummaryCitationRowProps) {
  return (
    <Pressable
      accessibilityLabel={citation.text}
      accessibilityRole="button"
      onPress={() => onPress(citation.segment_seq)}
      style={styles.row}
    >
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.text}>{citation.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  bullet: { ...typography.body, color: colors.primaryStrong },
  text: { ...typography.body, color: colors.text, flex: 1, lineHeight: 22 },
});
