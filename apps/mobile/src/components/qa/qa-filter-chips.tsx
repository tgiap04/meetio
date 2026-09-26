import { StyleSheet, Text, View } from 'react-native';
import type { QaFilters } from '@meetio/shared';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { formatCitationDate } from '../../utils/qa-formatting';

export interface QaFilterChipsProps {
  filters: QaFilters;
}

/**
 * Read-only chips under a past global question showing the filters it was
 * asked with (US-37, clarifications.md 2026-09-26: "bộ lọc ... hiện dạng
 * nhãn trên câu đó"). Renders nothing when the question carried no filter.
 */
export function QaFilterChips({ filters }: QaFilterChipsProps) {
  const labels: string[] = [];
  if (filters.from || filters.to) {
    const from = filters.from ? formatCitationDate(filters.from) : '…';
    const to = filters.to ? formatCitationDate(filters.to) : '…';
    labels.push(`${from} – ${to}`);
  }
  if (filters.entity_name) {
    labels.push(filters.entity_name);
  }

  if (labels.length === 0) {
    return null;
  }

  return (
    <View style={styles.row}>
      {labels.map((label) => (
        <Text key={label} style={styles.chip}>
          {label}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    ...typography.caption,
    color: colors.primaryText,
    backgroundColor: colors.primaryStrong,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
});
