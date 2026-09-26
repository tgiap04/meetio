import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { QaDateRangePicker } from './qa-date-range-picker';
import { QaEntityFilterPicker } from './qa-entity-filter-picker';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface QaQuestionFilters {
  from: string | null;
  to: string | null;
  entityId: string | null;
  entityName: string | null;
}

export interface QaFilterBarProps {
  filters: QaQuestionFilters;
  onChange: (filters: QaQuestionFilters) => void;
}

/**
 * Optional per-question filters above the global Q&A composer (US-37/39):
 * date range + entity, collapsed by default. These apply to the NEXT
 * question sent only — a past question's own filters are shown again via
 * `QaMessage.filters` / `QaFilterChips`, not by restoring this bar's state.
 */
export function QaFilterBar({ filters, onChange }: QaFilterBarProps) {
  const [expanded, setExpanded] = useState(Boolean(filters.entityId));
  const hasActiveFilters = Boolean(filters.from || filters.to || filters.entityId);

  return (
    <View style={styles.container}>
      <Pressable accessibilityRole="button" onPress={() => setExpanded((prev) => !prev)} testID="qa-filter-toggle">
        <Text style={styles.toggleLabel}>
          Bộ lọc câu hỏi{hasActiveFilters ? ' (đang áp dụng)' : ''} {expanded ? '▲' : '▼'}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.panel}>
          <QaDateRangePicker onChange={(range) => onChange({ ...filters, ...range })} />
          <QaEntityFilterPicker
            onClear={() => onChange({ ...filters, entityId: null, entityName: null })}
            onSelect={(entityId, entityName) => onChange({ ...filters, entityId, entityName })}
            selectedName={filters.entityName}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: colors.background },
  toggleLabel: { ...typography.caption, color: colors.textMuted },
  panel: { gap: 8, paddingVertical: 8 },
});
