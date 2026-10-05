import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, View, type FlatList as FlatListType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TranscriptSegmentItem } from '@meetio/shared';
import { TranscriptSegmentRow } from './transcript-segment-row';
import { TranscriptJumpControls } from './transcript-jump-controls';
import { TranscriptSearchingBanner } from './transcript-searching-banner';
import { AudioPlayerBar } from './audio-player-bar';
import type { TranscriptViewMode } from './view-mode';
import { ViewModeSwitch } from '../view-mode-switch';
import { EmptyState } from '../empty-state';
import { LoadingState } from '../loading-state';
import { ErrorState } from '../error-state';
import { ScreenHeader } from '../ui/screen-header';
import { SearchField } from '../ui/search-field';
import { useInfiniteSegmentsQuery } from '../../hooks/use-segments-query';
import { useUpdateSegmentMutation } from '../../hooks/use-segment-mutations';
import { useReindexMeetingMutation } from '../../hooks/use-meeting-mutations';
import { useMeetingQuery } from '../../hooks/use-meeting-detail-query';
import { useRetrySegmentTranslation } from '../../hooks/use-retry-segment-translation';
import { useTranslateSegment } from '../../hooks/use-translate-segment';
import { useFetchAllPagesForSearch } from '../../hooks/use-fetch-all-pages-for-search';
import { useScrollToInitialSeq } from '../../hooks/use-scroll-to-initial-seq';
import { getErrorMessage } from '../../api/error-messages';
import { readLastReadSeq, writeLastReadSeq } from '../../storage/transcript-read-position';
import { createScrollToIndexFallback } from '../../utils/scroll-to-index-fallback';
import { colors } from '../../theme/colors';

export interface RealTranscriptScreenProps {
  meetingId: string;
  onBack: () => void;
  /** Scrolls straight to this segment once its page loads — set when this
   *  screen is reached by tapping a Search-tab Transcript result (US-22). */
  initialSeq?: number;
}

function matchesQuery(segment: TranscriptSegmentItem, query: string, viewMode: TranscriptViewMode): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized === '') return true;
  if (viewMode !== 'translated' && segment.text.toLowerCase().includes(normalized)) return true;
  return viewMode !== 'original' && Boolean(segment.translated_text?.toLowerCase().includes(normalized));
}

/**
 * Screen 09, wired to the real, paged transcript (US-23/24). Segments arrive
 * `SEGMENTS_PAGE_SIZE` (200) at a time via `next_from_seq`; `FlatList` only
 * mounts the rows near the viewport, so a ~3600-segment 2h meeting stays
 * smooth without holding every row's view tree at once.
 *
 * A meeting recorded with translation (Phase 09) gets a Gốc / Dịch / Song song switch, and a
 * "Dịch" (on the device) on every segment that has no translation — one that failed while
 * recording, or whose text was edited.
 *
 * After an edit is saved, the user is asked whether to re-run the AI pipeline
 * (US-24) — the cost/time warning is stated plainly rather than assumed
 * understood, since re-analysis is not free or instant.
 */
export function RealTranscriptScreen({ meetingId, onBack, initialSeq }: RealTranscriptScreenProps) {
  const [query, setQuery] = useState('');
  const [lastReadSeq, setLastReadSeq] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<TranscriptViewMode>('both');
  const listRef = useRef<FlatListType<TranscriptSegmentItem>>(null);

  const segmentsQuery = useInfiniteSegmentsQuery(meetingId, initialSeq ?? null);
  const updateSegmentMutation = useUpdateSegmentMutation(meetingId);
  const reindexMutation = useReindexMeetingMutation(meetingId);
  const meeting = useMeetingQuery(meetingId);

  useEffect(() => {
    readLastReadSeq(meetingId).then(setLastReadSeq);
  }, [meetingId]);

  const segments = useMemo(
    () => segmentsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [segmentsQuery.data],
  );

  // "Dịch": translate the segment on the device and store it with the meeting (Phase 21).
  const translateSegment = useTranslateSegment(meetingId, meeting.data);
  const translationRetry = useRetrySegmentTranslation(async (seq) => {
    const segment = segments.find((item) => item.seq === seq);
    if (segment) await translateSegment(segment);
  });

  // Translation is in play when the meeting asked for it — or it already holds translations (translate_to switched off later).
  const translationEnabled = Boolean(meeting.data?.translate_to) || segments.some((segment) => segment.translated_text);

  useScrollToInitialSeq(segments, initialSeq, listRef);

  const trimmedQuery = query.trim();
  const filteredSegments = useMemo(
    () => segments.filter((segment) => matchesQuery(segment, query, translationEnabled ? viewMode : 'original')),
    [segments, query, translationEnabled, viewMode],
  );
  const isSearchingAllPages = useFetchAllPagesForSearch({
    hasQuery: trimmedQuery !== '',
    hasMatches: filteredSegments.length > 0,
    hasNextPage: Boolean(segmentsQuery.hasNextPage),
    isFetchingNextPage: segmentsQuery.isFetchingNextPage,
    fetchNextPage: segmentsQuery.fetchNextPage,
    searchKey: trimmedQuery,
  });

  const promptReindex = useCallback(() => {
    Alert.alert(
      'Chạy lại phân tích AI?',
      'Việc này sẽ tốn thời gian và chi phí xử lý AI để cập nhật tóm tắt và action items theo nội dung vừa sửa.',
      [
        { text: 'Để sau', style: 'cancel' },
        { text: 'Chạy lại', onPress: () => reindexMutation.mutate({ scope: 'changed' }) },
      ],
    );
  }, [reindexMutation]);

  function handleSaveSegment(segmentId: string, text: string) {
    updateSegmentMutation.mutate(
      { id: segmentId, body: { text } },
      {
        onSuccess: promptReindex,
        onError: (error) => Alert.alert('Không lưu được', getErrorMessage(error)),
      },
    );
  }

  function handleLoadMore() {
    if (segmentsQuery.hasNextPage && !segmentsQuery.isFetchingNextPage) {
      segmentsQuery.fetchNextPage();
    }
  }

  function scrollToTop() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }

  function scrollToBottom() {
    if (filteredSegments.length > 0) {
      listRef.current?.scrollToIndex({ index: filteredSegments.length - 1, animated: true });
    }
  }

  function jumpToLastRead() {
    if (lastReadSeq === null) {
      scrollToTop();
      return;
    }
    const index = filteredSegments.findIndex((segment) => segment.seq === lastReadSeq);
    if (index >= 0) {
      listRef.current?.scrollToIndex({ index, animated: true });
    }
  }

  function handleViewableItemsChanged({ viewableItems }: { viewableItems: Array<{ item: TranscriptSegmentItem }> }) {
    const lastVisible = viewableItems.at(-1)?.item;
    if (lastVisible) {
      writeLastReadSeq(meetingId, lastVisible.seq);
    }
  }

  const handleScrollToIndexFailed = createScrollToIndexFallback(listRef);

  if (segmentsQuery.isPending) {
    return <LoadingState />;
  }

  if (segmentsQuery.isError) {
    return <ErrorState message={getErrorMessage(segmentsQuery.error)} onRetry={() => segmentsQuery.refetch()} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenHeader
        onBack={onBack}
        title="Transcript"
        trailing={
          <TranscriptJumpControls
            onJumpToLastRead={jumpToLastRead}
            onScrollToBottom={scrollToBottom}
            onScrollToTop={scrollToTop}
          />
        }
      />
      {translationEnabled ? (
        <View style={styles.switchWrap}>
          <ViewModeSwitch onChange={setViewMode} value={viewMode} />
        </View>
      ) : null}
      <View style={styles.searchWrap}>
        <SearchField onChangeText={setQuery} placeholder="Tìm kiếm trong transcript..." value={query} />
        {isSearchingAllPages ? <TranscriptSearchingBanner /> : null}
      </View>
      <View style={styles.listWrap}>
        <FlatList
          data={filteredSegments}
          initialNumToRender={30}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            isSearchingAllPages ? null : (
              <EmptyState description="Thử một từ khóa khác." title="Không tìm thấy kết quả phù hợp" />
            )
          }
          maxToRenderPerBatch={30}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onViewableItemsChanged={handleViewableItemsChanged}
          ref={listRef}
          removeClippedSubviews
          extraData={{ viewMode, translationEnabled, retrying: translationRetry.retrying, errors: translationRetry.errors }}
          renderItem={({ item }) => (
            <TranscriptSegmentRow
              onRetryTranslation={() => void translationRetry.retry(item.seq)}
              onSave={(text) => handleSaveSegment(item.id, text)}
              retryingTranslation={translationRetry.retrying.has(item.seq)}
              segment={item}
              translationEnabled={translationEnabled}
              translationError={translationRetry.errors[item.seq]}
              viewMode={viewMode}
            />
          )}
          windowSize={10}
        />
      </View>
      <AudioPlayerBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  switchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  listWrap: { flex: 1, paddingHorizontal: 16 },
});
