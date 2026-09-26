import { StyleSheet, Text, View } from 'react-native';
import type { QaFilters } from '@meetio/shared';
import { QaFilterChips } from './qa-filter-chips';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface QaUserBubbleProps {
  content: string;
  /** Set only on a real, sent global question (`QaMessage.filters`); the
   *  optimistic pending bubble never has one to show yet. */
  filters?: QaFilters | null;
}

/** The asker's own bubble — right-aligned, brand fill. */
export function QaUserBubble({ content, filters }: QaUserBubbleProps) {
  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={styles.text}>{content}</Text>
      </View>
      {filters ? <QaFilterChips filters={filters} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-end', gap: 2 },
  bubble: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '85%',
  },
  text: { ...typography.body, color: colors.primaryText },
});
