import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, View, type FlatList as FlatListType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TranscriptSegmentItem } from '@meetio/shared';
import { TranscriptSegmentRow } from './transcript-segment-row';
import { TranscriptJumpControls } from './transcript-jump-controls';
import { TranscriptSearchingBanner } from './transcript-searching-banner';
import { AudioPlayerBar } from './audio-player-bar';
import { EmptyState } from '../empty-state';
import { LoadingState } from '../loading-state';
import { ErrorState } from '../error-state';
import { ScreenHeader } from '../ui/screen-header';
import { SearchField } from '../ui/search-field';
import { useInfiniteSegmentsQuery } from '../../hooks/use-segments-query';
import { useUpdateSegmentMutation } from '../../hooks/use-segment-mutations';
import { useReindexMeetingMutation } from '../../hooks/use-meeting-mutations';
import { useFetchAllPagesForSearch } from '../../hooks/use-fetch-all-pages-for-search';
import { getErrorMessage } from '../../api/error-messages';
import { readLastReadSeq, writeLastReadSeq } from '../../storage/transcript-read-position';
import { colors } from '../../theme/colors';

export interface RealTranscriptScreenProps {
  meetingId: string;
  onBack: () => void;
}

function matchesQuery(segment: TranscriptSegmentItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return normalized === '' || segment.text.toLowerCase().includes(normalized);
}

/**
 * Screen 09, wired to the real, paged transcript (US-23/24). Segments arrive
 * `SEGMENTS_PAGE_SIZE` (200) at a time via `next_from_seq`; `FlatList` only
 * mounts the rows near the viewport, so a ~3600-segment 2h meeting stays
 * smooth without holding every row's view tree at once.
 *
 * After an edit is saved, the user is asked whether to re-run the AI pipeline
 * (US-24) — the cost/time warning is stated plainly rather than assumed
 * understood, since re-analysis is not free or instant.
 */
export function RealTranscriptScreen({ meetingId, onBack }: RealTranscriptScreenProps) {
  const [query, setQuery] = useState('');
  const [lastReadSeq, setLastReadSeq] = useState<number | null>(null);
  const listRef = useRef<FlatListType<TranscriptSegmentItem>>(null);

  const segmentsQuery = useInfiniteSegmentsQuery(meetingId);
  const updateSegmentMutation = useUpdateSegmentMutation(meetingId);
  const reindexMutation = useReindexMeetingMutation(meetingId);

  useEffect(() => {
    readLastReadSeq(meetingId).then(setLastReadSeq);
  }, [meetingId]);

  const segments = useMemo(
    () => segmentsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [segmentsQuery.data],
  );
  const trimmedQuery = query.trim();
  const filteredSegments = useMemo(
    () => segments.filter((segment) => matchesQuery(segment, query)),
    [segments, query],
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
          onViewableItemsChanged={handleViewableItemsChanged}
          ref={listRef}
          removeClippedSubviews
          renderItem={({ item }) => (
            <TranscriptSegmentRow onSave={(text) => handleSaveSegment(item.id, text)} segment={item} />
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
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  listWrap: { flex: 1, paddingHorizontal: 16 },
});
