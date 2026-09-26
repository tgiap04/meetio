import { StyleSheet, Text, View } from 'react-native';
import type { SummaryCitation } from '@meetio/shared';
import { SectionHeading } from '../ui/section-heading';
import { SummaryCitationRow } from './summary-citation-row';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

const NOT_YET_SUMMARIZED = 'Chưa có tóm tắt cho cuộc họp này.';

export interface MeetingSummarySectionProps {
  summary: string | null;
  points: readonly SummaryCitation[];
  decisions: readonly SummaryCitation[];
  insufficient: boolean;
  hasUnprocessedEdits: boolean;
  onCitationPress: (segmentSeq: number) => void;
}

/**
 * "Tóm tắt nội dung" content tab (US-31). Three distinct states, in order of
 * precedence:
 * 1. `summary === null` — the summarize step hasn't run yet: "chưa có tóm tắt".
 * 2. `insufficient` — the meeting was too short/empty to summarize: the
 *    model's own sentence, shown as a plain notice, never as bullet points
 *    (a bullet list here would imply content that isn't there).
 * 3. Otherwise — real points and decisions, each line tappable to its source
 *    transcript segment (`segment_seq`).
 */
export function MeetingSummarySection({
  summary,
  points,
  decisions,
  insufficient,
  hasUnprocessedEdits,
  onCitationPress,
}: MeetingSummarySectionProps) {
  return (
    <View style={styles.container}>
      <SectionHeading title="Tóm tắt nội dung" />
      {hasUnprocessedEdits ? <Text style={styles.updatingLabel}>Đang cập nhật theo bản chỉnh sửa mới nhất…</Text> : null}
      {summary === null ? (
        <Text style={styles.notice}>{NOT_YET_SUMMARIZED}</Text>
      ) : insufficient ? (
        <Text style={styles.notice}>{summary}</Text>
      ) : (
        <>
          {points.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>Ý chính</Text>
              {points.map((point, index) => (
                <SummaryCitationRow citation={point} key={`point-${index}`} onPress={onCitationPress} />
              ))}
            </View>
          ) : null}
          {decisions.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>Quyết định</Text>
              {decisions.map((decision, index) => (
                <SummaryCitationRow citation={decision} key={`decision-${index}`} onPress={onCitationPress} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  group: { gap: 8 },
  groupTitle: { ...typography.label, color: colors.textMuted },
  notice: { ...typography.body, color: colors.textMuted, lineHeight: 24 },
  updatingLabel: { ...typography.caption, color: colors.warning },
});
