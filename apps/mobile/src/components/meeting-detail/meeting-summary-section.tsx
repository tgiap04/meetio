import { StyleSheet, Text, View } from 'react-native';
import { SectionHeading } from '../ui/section-heading';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { MeetingSummary } from '../../mocks/types';

export interface MeetingSummarySectionProps {
  summary: MeetingSummary;
}

/** "Tóm tắt nội dung" heading + paragraph, shown on the Tóm tắt content tab. */
export function MeetingSummarySection({ summary }: MeetingSummarySectionProps) {
  return (
    <View style={styles.container}>
      <SectionHeading title="Tóm tắt nội dung" />
      <Text style={styles.paragraph}>{summary.paragraph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  paragraph: { ...typography.body, color: colors.textMuted, lineHeight: 24 },
});
