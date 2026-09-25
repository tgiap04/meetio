import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TranscriptSegmentItem } from '@meetio/shared';
import { formatGapLabel, formatSegmentTimestamp } from '../../utils/segment-formatting';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface TranscriptSegmentRowProps {
  segment: TranscriptSegmentItem;
  onSave: (text: string) => void;
}

/**
 * One real transcript segment (US-23): timestamp from `started_at_ms`, a
 * visible gap marker when `gap_before_ms` is set (never hidden — the
 * recognizer really did restart there), an "đã sửa" badge once edited, and
 * tap-to-edit → save on blur (US-24). The reindex prompt after a save is the
 * screen's responsibility, not this row's — it only reports the new text.
 */
export function TranscriptSegmentRow({ segment, onSave }: TranscriptSegmentRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(segment.text);

  function handlePress() {
    setDraftText(segment.text);
    setIsEditing(true);
  }

  function handleBlur() {
    setIsEditing(false);
    const trimmed = draftText.trim();
    if (trimmed.length > 0 && trimmed !== segment.text) {
      onSave(trimmed);
    }
  }

  return (
    <View>
      {segment.gap_before_ms !== null ? (
        <Text style={styles.gapMarker}>{formatGapLabel(segment.gap_before_ms)}</Text>
      ) : null}
      <Pressable
        accessibilityLabel={`Sửa đoạn ${formatSegmentTimestamp(segment.started_at_ms)}`}
        onPress={handlePress}
        style={styles.row}
      >
        <View style={styles.headerRow}>
          <Text style={styles.timestamp}>{formatSegmentTimestamp(segment.started_at_ms)}</Text>
          {segment.is_edited ? <Text style={styles.editedBadge}>đã sửa</Text> : null}
        </View>
        {isEditing ? (
          <TextInput
            autoFocus
            multiline
            onBlur={handleBlur}
            onChangeText={setDraftText}
            style={styles.input}
            testID={`segment-edit-input-${segment.id}`}
            value={draftText}
          />
        ) : (
          <Text style={styles.text}>{segment.text}</Text>
        )}
        {segment.translated_text ? (
          <View style={styles.translationCard}>
            <Text style={styles.translationText}>{segment.translated_text}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, paddingVertical: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timestamp: { ...typography.caption, color: colors.textMuted },
  editedBadge: { ...typography.caption, color: colors.primaryStrong },
  text: { ...typography.body, color: colors.text },
  input: { ...typography.body, color: colors.text, padding: 0 },
  gapMarker: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: 8 },
  translationCard: { backgroundColor: colors.translationTint, borderRadius: 10, padding: 10, marginTop: 4 },
  translationText: { ...typography.body, color: colors.text },
});
