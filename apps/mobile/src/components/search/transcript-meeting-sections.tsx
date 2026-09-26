import type { ListMeetingsResponse, SearchResponse } from '@meetio/shared';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { SearchResultSection } from './search-result-section';
import { SemanticResultRow } from './semantic-result-row';
import { LoadMoreButton } from './load-more-button';
import { MeetingListRow } from '../ui/meeting-list-row';
import { LoadingState } from '../loading-state';
import { ErrorState } from '../error-state';
import { toStatusBadgeStatus } from '../ui/meeting-status-badge-mapping';
import { getErrorMessage } from '../../api/error-messages';
import { getSemanticSearchErrorMessage } from '../../api/semantic-search-error-message';
import { formatMeetingMeta } from '../../utils/meeting-formatting';

type SemanticQuery = UseInfiniteQueryResult<InfiniteData<SearchResponse>>;
type MeetingQuery = UseInfiniteQueryResult<InfiniteData<ListMeetingsResponse>>;

export interface TranscriptMeetingSectionsProps {
  transcriptEnabled: boolean;
  meetingEnabled: boolean;
  semanticQuery: SemanticQuery;
  meetingQuery: MeetingQuery;
  onTranscriptPress: (meetingId: string, segmentSeq: number) => void;
  onMeetingPress: (meetingId: string) => void;
}

/** The Search tab's original two sections (US-22) — extracted so the screen
 *  itself stays under the file-size guideline once the "Node" chip's
 *  sections were added alongside these. */
export function TranscriptMeetingSections({
  transcriptEnabled,
  meetingEnabled,
  semanticQuery,
  meetingQuery,
  onTranscriptPress,
  onMeetingPress,
}: TranscriptMeetingSectionsProps) {
  const semanticItems = semanticQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const meetingItems = meetingQuery.data?.pages.flatMap((page) => page.items) ?? [];

  function renderTranscriptSection() {
    if (!transcriptEnabled) {
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
          <SemanticResultRow item={item} key={item.chunk_id} onPress={onTranscriptPress} />
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
            onPress={() => onMeetingPress(item.id)}
            title={item.title}
          />
        ))}
      </SearchResultSection>
    );
  }

  return (
    <>
      {renderTranscriptSection()}
      {renderMeetingSection()}
    </>
  );
}
