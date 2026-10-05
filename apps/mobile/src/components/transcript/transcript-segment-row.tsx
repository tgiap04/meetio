import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TranscriptSegmentItem } from '@meetio/shared';
import { TranslatedSegment } from '../translated-segment';
import type { TranscriptViewMode } from './view-mode';
import { formatGapLabel, formatSegmentTimestamp } from '../../utils/segment-formatting';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface TranscriptSegmentRowProps {
  segment: TranscriptSegmentItem;
  onSave: (text: string) => void;
  /** Phase 09: which of original / translation to show. Defaults to the original alone. */
  viewMode?: TranscriptViewMode;
  /** The meeting translates its lines, so a line with no translation offers "Dịch" (on the device). */
  translationEnabled?: boolean;
  onRetryTranslation?: () => void;
  retryingTranslation?: boolean;
  translationError?: string | null;
}

/**
 * One real transcript segment (US-23): timestamp from `started_at_ms`, a
 * visible gap marker when `gap_before_ms` is set (never hidden — the
 * recognizer really did restart there), an "đã sửa" badge once edited, and
 * tap-to-edit → save on blur (US-24). The reindex prompt after a save is the
 * screen's responsibility, not this row's — it only reports the new text.
 */
export function TranscriptSegmentRow({
  segment,
  onSave,
  viewMode = 'original',
  translationEnabled = false,
  onRetryTranslation,
  retryingTranslation,
  translationError,
}: TranscriptSegmentRowProps) {
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

  const translation = translationEnabled ? segment.translated_text : null;
  // "Dịch" replaces the original, but only where a translation exists — a missing one never leaves a blank row.
  const showsTranslationOnly = viewMode === 'translated' && Boolean(translation);
  const showsTranslationCard = translationEnabled && viewMode !== 'original' && !showsTranslationOnly;

  return (
    <View>
      {segment.gap_before_ms !== null ? (
        <Text style={styles.gapMarker}>{formatGapLabel(segment.gap_before_ms)}</Text>
      ) : null}
      <Pressable
        accessibilityLabel={showsTranslationOnly ? undefined : `Sửa đoạn ${formatSegmentTimestamp(segment.started_at_ms)}`}
        disabled={showsTranslationOnly}
        onPress={showsTranslationOnly ? undefined : handlePress}
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
          <Text style={styles.text}>{showsTranslationOnly ? translation : segment.text}</Text>
        )}
        {showsTranslationCard ? (
          <TranslatedSegment
            error={translationError}
            failed={!translation}
            variant="missing"
            onRetry={onRetryTranslation}
            retrying={retryingTranslation}
            text={translation}
          />
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
});
