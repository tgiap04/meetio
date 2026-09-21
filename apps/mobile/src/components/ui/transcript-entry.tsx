import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface TranscriptEntryProps {
  /**
   * `"live"` — a turn from the in-progress recording (screen-06); gets a
   * left accent bar so an actively-updating transcript reads as distinct
   * from the finished one. `"review"` — a turn from a completed meeting's
   * transcript (screen-09); plain, no accent.
   */
  variant: 'live' | 'review';
  timestamp: string;
  text: string;
  /** Pale-blue translated line under the original — screen-06. */
  translation?: string;
}

/**
 * One transcript turn — live recording (screen-06) and transcript review
 * (screen-09).
 *
 * Carries no speaker name or avatar. The product records ambient audio from a
 * laptop speaker, so the incoming audio is one mixed stream and nothing in the
 * system knows who is talking (US-13, dropped 2026-09-21). The design draws a
 * name and an avatar per turn; showing either would mean inventing an
 * attribution the recording cannot support. Turns are separated by time alone.
 */
export function TranscriptEntry({ variant, timestamp, text, translation }: TranscriptEntryProps) {
  return (
    <View style={[styles.row, variant === 'live' && styles.rowLive]}>
      <Text style={styles.timestamp}>{timestamp}</Text>
      <Text style={styles.text}>{text}</Text>
      {translation ? (
        <View style={styles.translationCard}>
          <Text style={styles.translationText}>{translation}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, paddingVertical: 12 },
  rowLive: { borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: 10 },
  timestamp: { ...typography.caption, color: colors.textMuted },
  text: { ...typography.body, color: colors.text },
  translationCard: { backgroundColor: colors.translationTint, borderRadius: 10, padding: 10, marginTop: 4 },
  translationText: { ...typography.body, color: colors.text },
});
