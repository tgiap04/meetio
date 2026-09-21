import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TranscriptEntry } from '../ui/transcript-entry';
import { TRANSCRIPT_LINES } from '../../mocks';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export type LiveTranscriptLanguage = 'vi' | 'en';

export interface LiveTranscriptFeedProps {
  language: LiveTranscriptLanguage;
}

/** Shown under an English-tab entry that has no `translation` fixture value. */
const NO_TRANSLATION_NOTE = 'Chưa có bản dịch';

/**
 * The bilingual transcript feed below the language tabs. On "Tiếng Việt" each
 * fixture line renders as-is, with its translation card when it has one
 * (only `line-1` does — see `transcript.mock.ts`). On "Tiếng Anh" the
 * translation becomes the primary line; lines without one fall back to their
 * Vietnamese text plus a muted note, per phase-05 decision #6.
 */
export function LiveTranscriptFeed({ language }: LiveTranscriptFeedProps) {
  return (
    <ScrollView contentContainerStyle={styles.content} testID="live-transcript-feed">
      {TRANSCRIPT_LINES.map((line) => {
        const showFallbackNote = language === 'en' && !line.translation;
        const primaryText = language === 'en' && line.translation ? line.translation : line.text;
        const translationCard = language === 'vi' ? line.translation : undefined;

        return (
          <View key={line.id}>
            <TranscriptEntry
              speakerInitials={line.initials}
              speakerName={line.speaker}
              text={primaryText}
              timestamp={line.timestamp}
              translation={translationCard}
              variant="live"
            />
            {showFallbackNote ? <Text style={styles.fallbackNote}>{NO_TRANSLATION_NOTE}</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  fallbackNote: { ...typography.caption, color: colors.textMuted, marginTop: -2, marginBottom: 4 },
});
