import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SearchHeader } from '../../../src/components/search/search-header';
import { SearchResultSection } from '../../../src/components/search/search-result-section';
import { SemanticResultRow } from '../../../src/components/search/semantic-result-row';
import { LoadMoreButton } from '../../../src/components/search/load-more-button';
import { SearchField } from '../../../src/components/ui/search-field';
import { FilterChipRow } from '../../../src/components/ui/filter-chip-row';
import { MeetingListRow } from '../../../src/components/ui/meeting-list-row';
import { EmptyState } from '../../../src/components/empty-state';
import { LoadingState } from '../../../src/components/loading-state';
import { ErrorState } from '../../../src/components/error-state';
import { useInfiniteSearchQuery } from '../../../src/hooks/use-search-query';
import { useInfiniteMeetingsQuery } from '../../../src/hooks/use-meetings-query';
import { useDebouncedValue } from '../../../src/hooks/use-debounced-value';
import { getErrorMessage } from '../../../src/api/error-messages';
import { getSemanticSearchErrorMessage } from '../../../src/api/semantic-search-error-message';
import { toStatusBadgeStatus } from '../../../src/components/ui/meeting-status-badge-mapping';
import { formatMeetingMeta } from '../../../src/utils/meeting-formatting';
import { MEETING_DETAIL_ROUTE, MEETING_TRANSCRIPT_ROUTE } from '../../../src/navigation/app-routes';
import { colors } from '../../../src/theme/colors';

type KindFilterKey = 'all' | 'transcript' | 'meeting';

const CHIPS: Array<{ key: KindFilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'transcript', label: 'Transcript' },
  { key: 'meeting', label: 'Meeting' },
];

const SEARCH_FIELD_PLACEHOLDER = 'Tìm theo từ khóa, người, dự án...';
const SEARCH_DEBOUNCE_MS = 400;
/** Below this, semantic search does not fire — it costs a Gemini embedding
 *  lookup per call and is rate-limited (60/min/user, docs/api-spec.md §6). */
const MIN_SEMANTIC_QUERY_LENGTH = 2;

/**
 * Search tab (screen-13), wired to the real search endpoints (US-22):
 * `GET /search` (semantic — the "Transcript" chip, excerpt cards that open
 * the meeting's transcript scrolled to the match) and `GET /meetings?q=`
 * (title search — the "Meeting" chip, reusing the Library tab's row).
 *
 * Per clarifications.md (2026-09-26) the design's "Node" chip and "Người"
 * group are hidden until Phase 13, and the "Tài liệu" mock group is dropped
 * entirely — the Transcript section replaces it with real data.
 */
export default function SearchScreen() {
  const [queryText, setQueryText] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilterKey>('all');
  const trimmedQuery = useDebouncedValue(queryText, SEARCH_DEBOUNCE_MS).trim();

  const showTranscript = kindFilter !== 'meeting';
  const showMeeting = kindFilter !== 'transcript';
  const semanticEnabled = showTranscript && trimmedQuery.length >= MIN_SEMANTIC_QUERY_LENGTH;
  const meetingEnabled = showMeeting && trimmedQuery.length > 0;

  const semanticQuery = useInfiniteSearchQuery(trimmedQuery, semanticEnabled);
  const meetingQuery = useInfiniteMeetingsQuery({ q: trimmedQuery, limit: 20 }, { enabled: meetingEnabled });

  const semanticItems = semanticQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const meetingItems = meetingQuery.data?.pages.flatMap((page) => page.items) ?? [];

  function handleTranscriptPress(meetingId: string, segmentSeq: number) {
    router.push({ pathname: MEETING_TRANSCRIPT_ROUTE, params: { id: meetingId, seq: String(segmentSeq) } });
  }

  function handleMeetingPress(meetingId: string) {
    router.push({ pathname: MEETING_DETAIL_ROUTE, params: { id: meetingId } });
  }

  function handleFilterPress() {
    // Intentionally inert — the design draws the funnel button but defines
    // no filter panel for it to open (unchanged from the mock build).
  }

  function renderTranscriptSection() {
    if (!semanticEnabled) {
      return null;
    }
    if (semanticQuery.isPending) {
      return <LoadingState label="Đang tìm trong transcript…" />;
    }
    if (semanticQuery.isError) {
      return (
        <ErrorState
          message={getSemanticSearchErrorMessage(semanticQuery.error)}
          onRetry={() => semanticQuery.refetch()}
        />
      );
    }
    if (semanticItems.length === 0) {
      return null;
    }
    return (
      <SearchResultSection
        footer={
          semanticQuery.hasNextPage ? (
            <LoadMoreButton loading={semanticQuery.isFetchingNextPage} onPress={() => semanticQuery.fetchNextPage()} />
          ) : null
        }
        title={`Transcript (${semanticItems.length})`}
      >
        {semanticItems.map((item) => (
          <SemanticResultRow item={item} key={item.chunk_id} onPress={handleTranscriptPress} />
        ))}
      </SearchResultSection>
    );
  }

  function renderMeetingSection() {
    if (!meetingEnabled) {
      return null;
    }
    if (meetingQuery.isPending) {
      return <LoadingState label="Đang tìm cuộc họp…" />;
    }
    if (meetingQuery.isError) {
      return <ErrorState message={getErrorMessage(meetingQuery.error)} onRetry={() => meetingQuery.refetch()} />;
    }
    if (meetingItems.length === 0) {
      return null;
    }
    return (
      <SearchResultSection
        footer={
          meetingQuery.hasNextPage ? (
            <LoadMoreButton loading={meetingQuery.isFetchingNextPage} onPress={() => meetingQuery.fetchNextPage()} />
          ) : null
        }
        title={`Cuộc họp (${meetingItems.length})`}
      >
        {meetingItems.map((item) => (
          <MeetingListRow
            badge={{ status: toStatusBadgeStatus(item.status) }}
            key={item.id}
            leading="waveform"
            meta={formatMeetingMeta(item)}
            onPress={() => handleMeetingPress(item.id)}
            title={item.title}
          />
        ))}
      </SearchResultSection>
    );
  }

  const hasAnyEnabledSection = semanticEnabled || meetingEnabled;
  const transcriptSettled = !semanticEnabled || (!semanticQuery.isPending && !semanticQuery.isError);
  const meetingSettled = !meetingEnabled || (!meetingQuery.isPending && !meetingQuery.isError);
  const transcriptEmpty = !semanticEnabled || semanticItems.length === 0;
  const meetingEmpty = !meetingEnabled || meetingItems.length === 0;
  const showNoResults =
    trimmedQuery !== '' && hasAnyEnabledSection && transcriptSettled && meetingSettled && transcriptEmpty && meetingEmpty;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <SearchHeader />
        <SearchField
          onChangeText={setQueryText}
          onFilterPress={handleFilterPress}
          placeholder={SEARCH_FIELD_PLACEHOLDER}
          value={queryText}
        />
        <FilterChipRow activeKey={kindFilter} chips={CHIPS} onChange={(key) => setKindFilter(key as KindFilterKey)} />
        {trimmedQuery === '' ? (
          <EmptyState
            description="Tìm theo nội dung transcript hoặc tiêu đề cuộc họp."
            title="Nhập từ khóa để tìm kiếm"
          />
        ) : (
          <>
            {renderTranscriptSection()}
            {renderMeetingSection()}
            {showNoResults ? (
              <EmptyState description="Thử một từ khóa khác." title="Không tìm thấy kết quả phù hợp" />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 20, gap: 16, paddingBottom: 32 },
});
