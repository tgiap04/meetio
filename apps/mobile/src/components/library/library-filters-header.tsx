import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LibraryHeader } from './library-header';
import { SearchField } from '../ui/search-field';
import { FilterChipRow, type FilterChip } from '../ui/filter-chip-row';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export interface LibraryFiltersHeaderProps {
  queryText: string;
  onQueryTextChange: (text: string) => void;
  searchPlaceholder: string;
  statusFilterKey: string;
  statusFilters: FilterChip[];
  onStatusFilterChange: (key: string) => void;
  onFilterPress: () => void;
  dateRangeLabel: string | null;
  onClearDateRange: () => void;
  pendingDeleteId: string | null;
  onUndoDelete: () => void;
}

/**
 * Library's `ListHeaderComponent` (US-20/21/26): search + status chips + the
 * active date-range chip + the delete-undo banner. Split out of
 * `library.tsx` to keep that screen file under the project's 200-line
 * guidance once it also owns the `FlatList` wiring.
 */
export function LibraryFiltersHeader({
  queryText,
  onQueryTextChange,
  searchPlaceholder,
  statusFilterKey,
  statusFilters,
  onStatusFilterChange,
  onFilterPress,
  dateRangeLabel,
  onClearDateRange,
  pendingDeleteId,
  onUndoDelete,
}: LibraryFiltersHeaderProps) {
  return (
    <View style={styles.container}>
      <LibraryHeader />
      <SearchField
        onChangeText={onQueryTextChange}
        onFilterPress={onFilterPress}
        placeholder={searchPlaceholder}
        value={queryText}
      />
      <FilterChipRow activeKey={statusFilterKey} chips={statusFilters} onChange={onStatusFilterChange} />
      {dateRangeLabel ? (
        <Pressable
          accessibilityLabel={`${dateRangeLabel}, bỏ lọc thời gian`}
          accessibilityRole="button"
          onPress={onClearDateRange}
          style={styles.dateChip}
          testID="library-date-filter-chip"
        >
          <Text style={styles.dateChipLabel}>{`${dateRangeLabel} ×`}</Text>
        </Pressable>
      ) : null}
      {pendingDeleteId ? (
        <View style={styles.undoBanner} testID="delete-undo-banner">
          <Text style={styles.undoText}>Đã xóa cuộc họp.</Text>
          <Pressable accessibilityRole="button" onPress={onUndoDelete}>
            <Text style={styles.undoAction}>Hoàn tác</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16, paddingBottom: 12 },
  dateChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryTint,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dateChipLabel: { ...typography.caption, color: colors.primaryStrong, fontWeight: '600' },
  undoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  undoText: { ...typography.body, color: colors.background },
  undoAction: { ...typography.button, color: colors.primary },
});
