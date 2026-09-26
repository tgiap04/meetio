import { StyleSheet, Text, View } from 'react-native';
import type { QaCitation, QaMessage } from '@meetio/shared';
import { CitationChip } from '../citation-chip';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface QaAssistantBubbleProps {
  message: QaMessage;
  onCitationPress: (citation: QaCitation) => void;
}

const NOT_FOUND_TEXT = 'Không tìm thấy thông tin liên quan trong các cuộc họp.';
const LOW_CONFIDENCE_TEXT = 'Câu trả lời chưa có nguồn chắc chắn.';

/**
 * The model's own bubble (US-35→37): a plain "không tìm thấy" notice when
 * `not_found`, a visible low-confidence warning line when `low_confidence`,
 * and tappable citation chips otherwise.
 */
export function QaAssistantBubble({ message, onCitationPress }: QaAssistantBubbleProps) {
  return (
    <View style={styles.container} testID={`qa-assistant-bubble-${message.id}`}>
      <View style={styles.bubble}>
        {message.not_found ? (
          <Text style={styles.notice}>{NOT_FOUND_TEXT}</Text>
        ) : (
          <>
            <Text style={styles.text}>{message.content}</Text>
            {message.low_confidence ? <Text style={styles.warning}>{LOW_CONFIDENCE_TEXT}</Text> : null}
            {message.citations.length > 0 ? (
              <View style={styles.chips}>
                {message.citations.map((citation) => (
                  <CitationChip citation={citation} key={citation.chunk_id} onPress={onCitationPress} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-start' },
  bubble: {
    backgroundColor: colors.background,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '90%',
    gap: 6,
  },
  text: { ...typography.body, color: colors.text },
  notice: { ...typography.body, color: colors.textMuted, fontStyle: 'italic' },
  warning: { ...typography.caption, color: colors.warning },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
});
