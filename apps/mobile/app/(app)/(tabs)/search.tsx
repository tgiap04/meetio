import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SearchHeader } from '../../../src/components/search/search-header';
import { TranscriptMeetingSections } from '../../../src/components/search/transcript-meeting-sections';
import { EntitySearchSections } from '../../../src/components/search/entity-search-sections';
import { SearchField } from '../../../src/components/ui/search-field';
import { FilterChipRow } from '../../../src/components/ui/filter-chip-row';
import { EmptyState } from '../../../src/components/empty-state';
import { useInfiniteSearchQuery } from '../../../src/hooks/use-search-query';
import { useInfiniteMeetingsQuery } from '../../../src/hooks/use-meetings-query';
import { useInfiniteEntitiesQuery } from '../../../src/hooks/use-entities-query';
import { useDebouncedValue } from '../../../src/hooks/use-debounced-value';
import { ENTITY_DETAIL_ROUTE, MEETING_DETAIL_ROUTE, MEETING_TRANSCRIPT_ROUTE } from '../../../src/navigation/app-routes';
import { colors } from '../../../src/theme/colors';

type KindFilterKey = 'all' | 'transcript' | 'meeting' | 'node';

const CHIPS: Array<{ key: KindFilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'transcript', label: 'Transcript' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'node', label: 'Node' },
];

const SEARCH_FIELD_PLACEHOLDER = 'Tìm theo từ khóa, người, dự án...';
const SEARCH_DEBOUNCE_MS = 400;
/** Below this, semantic search does not fire — it costs a Gemini embedding
 *  lookup per call and is rate-limited (60/min/user, docs/api-spec.md §6). */
const MIN_SEMANTIC_QUERY_LENGTH = 2;

/**
 * Search tab (screen-13), wired to the real search endpoints (US-22, US-38):
 * `GET /search` (semantic — the "Transcript" chip), `GET /meetings?q=` (title
 * search — the "Meeting" chip) — both rendered by `TranscriptMeetingSections`
 * — and `GET /entities?q=` (the "Node" chip — a generic "Thực thể" section
 * plus a `type=person`-only "Người" section, both tapping to entity detail;
 * see `entity-search-sections.tsx`).
 *
 * Per clarifications.md (2026-09-26) the "Node" chip and "Người" group,
 * hidden through Phase 12, are unhidden here. The design's "Tài liệu" mock
 * group stays dropped — the Transcript section replaces it with real data.
 */
export default function SearchScreen() {
  const [queryText, setQueryText] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilterKey>('all');
  const trimmedQuery = useDebouncedValue(queryText, SEARCH_DEBOUNCE_MS).trim();

  const showTranscript = kindFilter === 'all' || kindFilter === 'transcript';
  const showMeeting = kindFilter === 'all' || kindFilter === 'meeting';
  const showNode = kindFilter === 'all' || kindFilter === 'node';
  const semanticEnabled = showTranscript && trimmedQuery.length >= MIN_SEMANTIC_QUERY_LENGTH;
  const meetingEnabled = showMeeting && trimmedQuery.length > 0;
  const nodeEnabled = showNode && trimmedQuery.length > 0;

  const semanticQuery = useInfiniteSearchQuery(trimmedQuery, semanticEnabled);
  const meetingQuery = useInfiniteMeetingsQuery({ q: trimmedQuery, limit: 20 }, { enabled: meetingEnabled });
  const entityQuery = useInfiniteEntitiesQuery({ q: trimmedQuery }, nodeEnabled);
  const personQuery = useInfiniteEntitiesQuery({ q: trimmedQuery, type: 'person' }, nodeEnabled);

  const semanticItems = semanticQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const meetingItems = meetingQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const entityItems = entityQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const personItems = personQuery.data?.pages.flatMap((page) => page.items) ?? [];

  function handleTranscriptPress(meetingId: string, segmentSeq: number) {
    router.push({ pathname: MEETING_TRANSCRIPT_ROUTE, params: { id: meetingId, seq: String(segmentSeq) } });
  }

  function handleMeetingPress(meetingId: string) {
    router.push({ pathname: MEETING_DETAIL_ROUTE, params: { id: meetingId } });
  }

  function handleEntityPress(id: string) {
    router.push({ pathname: ENTITY_DETAIL_ROUTE, params: { id } });
  }

  function handleFilterPress() {
    // Intentionally inert — the design draws the funnel button but defines
    // no filter panel for it to open (unchanged from the mock build).
  }

  const hasAnyEnabledSection = semanticEnabled || meetingEnabled || nodeEnabled;
  const transcriptSettled = !semanticEnabled || (!semanticQuery.isPending && !semanticQuery.isError);
  const meetingSettled = !meetingEnabled || (!meetingQuery.isPending && !meetingQuery.isError);
  const nodeSettled =
    !nodeEnabled ||
    ((!entityQuery.isPending && !entityQuery.isError) && (!personQuery.isPending && !personQuery.isError));
  const transcriptEmpty = !semanticEnabled || semanticItems.length === 0;
  const meetingEmpty = !meetingEnabled || meetingItems.length === 0;
  const nodeEmpty = !nodeEnabled || (entityItems.length === 0 && personItems.length === 0);
  const showNoResults =
    trimmedQuery !== '' &&
    hasAnyEnabledSection &&
    transcriptSettled &&
    meetingSettled &&
    nodeSettled &&
    transcriptEmpty &&
    meetingEmpty &&
    nodeEmpty;

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
            <TranscriptMeetingSections
              meetingEnabled={meetingEnabled}
              meetingQuery={meetingQuery}
              onMeetingPress={handleMeetingPress}
              onTranscriptPress={handleTranscriptPress}
              semanticQuery={semanticQuery}
              transcriptEnabled={semanticEnabled}
            />
            <EntitySearchSections
              enabled={nodeEnabled}
              entityQuery={entityQuery}
              onEntityPress={handleEntityPress}
              personQuery={personQuery}
            />
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
