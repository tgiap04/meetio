import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { ScreenSurface } from '../../../src/components/ui/screen-surface';
import { router } from 'expo-router';
import { LibraryHeader } from '../../../src/components/library/library-header';
import { LibrarySection } from '../../../src/components/library/library-section';
import {
  LAST_WEEK_MEETING_IDS,
  RECENT_MEETING_IDS,
} from '../../../src/components/library/library-groups';
import { SearchField } from '../../../src/components/ui/search-field';
import { FilterChipRow, type FilterChip } from '../../../src/components/ui/filter-chip-row';
import { MEETINGS } from '../../../src/mocks';
import type { MeetingStatus } from '../../../src/mocks/types';
import { MEETING_DETAIL_ROUTE } from '../../../src/navigation/app-routes';
import { colors } from '../../../src/theme/colors';

type StatusFilterKey = 'all' | MeetingStatus;

const STATUS_FILTERS: FilterChip[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'done', label: 'Đã xử lý' },
  { key: 'processing', label: 'Đang xử lý' },
];

/**
 * Borrowed verbatim from screen-13's search placeholder rather than
 * inventing new copy (screen-12's own placeholder, "Đặt câu hỏi về cuộc
 * họp…", is the same Hỏi-đáp-AI copy-paste the header carried — out of
 * scope here per `clarifications.md` §1). Screen-13's crop is genuinely
 * low-resolution at the source; this is a best-effort transcription, flagged
 * in the phase-10 hand-back for phase 11 (which owns screen 13 and the
 * canonical string) to confirm or correct independently.
 */
const SEARCH_PLACEHOLDER = 'Tìm theo từ khóa, người, dự án…';

/**
 * The funnel button beside the search field is rendered, per the crop, but
 * deliberately does nothing: the design gives it no distinct behaviour on
 * this screen beyond the status chip row already below it, and no
 * filter-sheet destination exists anywhere in the design. See phase-10
 * hand-back.
 */
function handleFilterPress() {
  // no-op — intentionally inert, see comment above.
}

/** Library tab (screen-12): search, status filter, two date-grouped meeting sections. */
export default function LibraryScreen() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');

  const filteredMeetings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return MEETINGS.filter((meeting) => {
      const matchesStatus = statusFilter === 'all' || meeting.status === statusFilter;
      const matchesQuery =
        normalizedQuery.length === 0 || meeting.title.toLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter]);

  const recentMeetings = filteredMeetings.filter((meeting) =>
    RECENT_MEETING_IDS.includes(meeting.id),
  );
  const lastWeekMeetings = filteredMeetings.filter((meeting) =>
    LAST_WEEK_MEETING_IDS.includes(meeting.id),
  );

  function handleMeetingPress(meetingId: string) {
    router.push({ pathname: MEETING_DETAIL_ROUTE, params: { id: meetingId } });
  }

  function handleStatusFilterChange(key: string) {
    setStatusFilter(key as StatusFilterKey);
  }

  return (
    <ScreenSurface>
      <ScrollView contentContainerStyle={styles.container} style={styles.scroll}>
        <LibraryHeader />
        <SearchField
          onChangeText={setQuery}
          onFilterPress={handleFilterPress}
          placeholder={SEARCH_PLACEHOLDER}
          value={query}
        />
        <FilterChipRow
          activeKey={statusFilter}
          chips={STATUS_FILTERS}
          onChange={handleStatusFilterChange}
        />
        <LibrarySection
          meetings={recentMeetings}
          onMeetingPress={handleMeetingPress}
          title="Gần đây"
        />
        <LibrarySection
          meetings={lastWeekMeetings}
          onMeetingPress={handleMeetingPress}
          title="Tuần trước"
        />
      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  container: { padding: 20, gap: 16, paddingBottom: 32 },
});
