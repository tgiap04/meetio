import { StyleSheet, Text, View } from 'react-native';
import { InitialsAvatar } from './initials-avatar';
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
  speakerInitials: string;
  speakerName: string;
  timestamp: string;
  text: string;
  /** Pale-blue translated line under the original — screen-06. */
  translation?: string;
}

/** One speaker turn — live recording (screen-06) and transcript review (screen-09). */
export function TranscriptEntry({ variant, speakerInitials, speakerName, timestamp, text, translation }: TranscriptEntryProps) {
  return (
    <View style={[styles.row, variant === 'live' && styles.rowLive]}>
      <InitialsAvatar initials={speakerInitials} size={36} />
      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={styles.speaker}>{speakerName}</Text>
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>
        <Text style={styles.text}>{text}</Text>
        {translation ? (
          <View style={styles.translationCard}>
            <Text style={styles.translationText}>{translation}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  rowLive: { borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: 10 },
  body: { flex: 1, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  speaker: { ...typography.label, color: colors.text },
  timestamp: { ...typography.caption, color: colors.textMuted },
  text: { ...typography.body, color: colors.text },
  translationCard: { backgroundColor: colors.translationTint, borderRadius: 10, padding: 10, marginTop: 4 },
  translationText: { ...typography.body, color: colors.text },
});
