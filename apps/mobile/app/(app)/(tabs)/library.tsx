import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet } from 'react-native';
import { ScreenSurface } from '../../../src/components/ui/screen-surface';
import { router } from 'expo-router';
import { MeetingStatus, type MeetingListItem } from '@meetio/shared';
import { LibraryFiltersHeader } from '../../../src/components/library/library-filters-header';
import { MeetingListRow } from '../../../src/components/ui/meeting-list-row';
import {
  LibraryDateFilterSheet,
  type DateRangeFilter,
} from '../../../src/components/library/library-date-filter-sheet';
import { EmptyState } from '../../../src/components/empty-state';
import { LoadingState } from '../../../src/components/loading-state';
import { ErrorState } from '../../../src/components/error-state';
import { useInfiniteMeetingsQuery } from '../../../src/hooks/use-meetings-query';
import { useDebouncedValue } from '../../../src/hooks/use-debounced-value';
import { useDeleteMeetingWithUndo } from '../../../src/hooks/use-delete-meeting-with-undo';
import { getErrorMessage } from '../../../src/api/error-messages';
import { toStatusBadgeStatus } from '../../../src/components/ui/meeting-status-badge-mapping';
import { formatMeetingMeta } from '../../../src/utils/meeting-formatting';
import { formatDateRangeLabel } from '../../../src/utils/date-range-formatting';
import { MEETING_DETAIL_ROUTE } from '../../../src/navigation/app-routes';
import { colors } from '../../../src/theme/colors';
import type { FilterChip } from '../../../src/components/ui/filter-chip-row';

type StatusFilterKey = 'all' | MeetingStatus;

const STATUS_FILTERS: FilterChip[] = [
  { key: 'all', label: 'Tất cả' },
  { key: MeetingStatus.READY, label: 'Đã xử lý' },
  { key: MeetingStatus.PROCESSING, label: 'Đang xử lý' },
];

const SEARCH_PLACEHOLDER = 'Tìm theo tiêu đề cuộc họp…';
const SEARCH_DEBOUNCE_MS = 400;
const EMPTY_DATE_RANGE: DateRangeFilter = { from: null, to: null };

/**
 * Library tab (screen-12), wired to the real `/meetings` list (US-20/21):
 * server-side title search (debounced), status filter, and a date-range
 * filter (US-21 — the funnel button beside search, inert in the mock build,
 * now opens `LibraryDateFilterSheet`, see `library-filters-header.tsx`); paged
 * by `next_cursor` via `FlatList`'s `onEndReached` so scrolling to the bottom
 * of hundreds of rows loads more without a manual button, and rows outside
 * the viewport aren't mounted.
 *
 * A client-side 10s undo window on delete (US-26 — long press a row, see
 * `use-delete-meeting-with-undo.ts`).
 *
 * The mock's two hardcoded "Gần đây" / "Tuần trước" date groups are dropped:
 * they were keyed off fixture ids with no server equivalent, so the real feed
 * renders one continuous, server-ordered list instead of inventing a
 * date-bucketing rule the design never specified.
 */
export default function LibraryScreen() {
  const [queryText, setQueryText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>(EMPTY_DATE_RANGE);
  const [dateFilterVisible, setDateFilterVisible] = useState(false);
  const debouncedQuery = useDebouncedValue(queryText.trim(), SEARCH_DEBOUNCE_MS);
  const { pendingDeleteId, startDelete, undoDelete } = useDeleteMeetingWithUndo();

  const meetingsQuery = useInfiniteMeetingsQuery({
    q: debouncedQuery === '' ? undefined : debouncedQuery,
    status: statusFilter === 'all' ? undefined : statusFilter,
    from: dateRange.from ?? undefined,
    to: dateRange.to ?? undefined,
    limit: 20,
  });

  const meetings = useMemo(
    () =>
      (meetingsQuery.data?.pages.flatMap((page) => page.items) ?? []).filter(
        (meeting) => meeting.id !== pendingDeleteId,
      ),
    [meetingsQuery.data, pendingDeleteId],
  );

  if (meetingsQuery.isPending) {
    return <LoadingState />;
  }

  if (meetingsQuery.isError) {
    return (
      <ErrorState
        message={getErrorMessage(meetingsQuery.error)}
        onRetry={() => meetingsQuery.refetch()}
      />
    );
  }

  function handleMeetingPress(meetingId: string) {
    router.push({ pathname: MEETING_DETAIL_ROUTE, params: { id: meetingId } });
  }

  function handleDeleteRequest(meeting: MeetingListItem) {
    Alert.alert('Xóa cuộc họp', `Xóa "${meeting.title}"? Bạn sẽ có 10 giây để hoàn tác.`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => startDelete(meeting.id) },
    ]);
  }

  function handleLoadMore() {
    if (meetingsQuery.hasNextPage && !meetingsQuery.isFetchingNextPage) {
      meetingsQuery.fetchNextPage();
    }
  }

  const dateRangeLabel = formatDateRangeLabel(dateRange.from, dateRange.to);
  const hasActiveFilters = debouncedQuery !== '' || statusFilter !== 'all' || dateRangeLabel !== null;

  return (
    <ScreenSurface>
      <FlatList
        contentContainerStyle={styles.container}
        data={meetings}
        initialNumToRender={12}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            description={
              hasActiveFilters ? 'Xóa từ khóa hoặc bộ lọc để xem tất cả cuộc họp.' : undefined
            }
            title={hasActiveFilters ? 'Không có kết quả phù hợp' : 'Chưa có cuộc họp nào'}
          />
        }
        ListFooterComponent={
          meetingsQuery.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.footerSpinner} testID="library-load-more-spinner" />
          ) : null
        }
        ListHeaderComponent={
          <LibraryFiltersHeader
            dateRangeLabel={dateRangeLabel}
            onClearDateRange={() => setDateRange(EMPTY_DATE_RANGE)}
            onFilterPress={() => setDateFilterVisible(true)}
            onQueryTextChange={setQueryText}
            onStatusFilterChange={(key) => setStatusFilter(key as StatusFilterKey)}
            onUndoDelete={undoDelete}
            pendingDeleteId={pendingDeleteId}
            queryText={queryText}
            searchPlaceholder={SEARCH_PLACEHOLDER}
            statusFilterKey={statusFilter}
            statusFilters={STATUS_FILTERS}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <MeetingListRow
            badge={{ status: toStatusBadgeStatus(item.status) }}
            leading="waveform"
            meta={formatMeetingMeta(item)}
            onLongPress={() => handleDeleteRequest(item)}
            onPress={() => handleMeetingPress(item.id)}
            title={item.title}
          />
        )}
        style={styles.list}
        windowSize={7}
      />
      <LibraryDateFilterSheet
        initialRange={dateRange}
        onApply={(range) => {
          setDateRange(range);
          setDateFilterVisible(false);
        }}
        onClose={() => setDateFilterVisible(false)}
        visible={dateFilterVisible}
      />
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.surface },
  container: { padding: 20, paddingBottom: 32, gap: 2 },
  footerSpinner: { paddingVertical: 16 },
});
