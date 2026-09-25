import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { router, useLocalSearchParams } from 'expo-router';
import { MeetingStatus, type ExportSection } from '@meetio/shared';
import { AppIcon } from '../../src/components/icons/app-icon';
import { ActionItemsSection } from '../../src/components/meeting-detail/action-items-section';
import { MeetingDetailHero } from '../../src/components/meeting-detail/meeting-detail-hero';
import { MeetingSummarySection } from '../../src/components/meeting-detail/meeting-summary-section';
import { MeetingProcessingStatus } from '../../src/components/meeting-detail/meeting-processing-status';
import { ExportSheet } from '../../src/components/meeting-detail/export-sheet';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { SegmentedTabs } from '../../src/components/ui/segmented-tabs';
import { LoadingState } from '../../src/components/loading-state';
import { ErrorState } from '../../src/components/error-state';
import { useMeetingQuery } from '../../src/hooks/use-meeting-detail-query';
import { useReindexMeetingMutation, useUpdateMeetingMutation } from '../../src/hooks/use-meeting-mutations';
import { useExportMeetingMutation } from '../../src/hooks/use-export-meeting-mutation';
import { useMeetingRoomSocket } from '../../src/hooks/use-meeting-room-socket';
import { getErrorMessage } from '../../src/api/error-messages';
import { toActionItem, toMeetingSummary } from '../../src/utils/meeting-detail-mappers';
import { MEETING_GRAPH_ROUTE, MEETING_TRANSCRIPT_ROUTE } from '../../src/navigation/app-routes';
import { colors } from '../../src/theme/colors';

/** The two tabs that swap content in place. Kept narrower than the full tab
 *  row so the active-tab state can never land on a navigating tab. */
type ContentTabKey = 'summary' | 'action-items';

const TAB_ITEMS = [
  { key: 'summary', label: 'Tóm tắt' },
  { key: 'action-items', label: 'Action Items' },
  { key: 'transcript', label: 'Transcript' },
  { key: 'graph', label: 'Graph' },
];

/**
 * Screen 08 — the hub every recording/meeting flow converges on, now wired to
 * the real `/meetings/:id` (US-20/24/25/27/28). Route shape stays flat
 * (`?id=`, not `[id]/`) per phase-07's file-ownership note.
 *
 * Realtime: `useMeetingRoomSocket` joins `/meeting-room` for this meeting and
 * refetches on `processing_status`/`meeting_ready`, so a `queued`/`processing`
 * meeting's step advances live rather than only on manual refresh.
 *
 * The kebab, inert in the mock build, is now the export entry point (US-27) —
 * the design draws no export surface, so this is a deliberate repurposing of
 * the one affordance already in the header rather than adding a second icon.
 */
export default function MeetingDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const meetingQuery = useMeetingQuery(id);
  useMeetingRoomSocket(id);
  const updateMeetingMutation = useUpdateMeetingMutation(id ?? '');
  const reindexMutation = useReindexMeetingMutation(id ?? '');
  const exportMutation = useExportMeetingMutation(id ?? '', meetingQuery.data?.title ?? 'cuoc-hop');

  const [activeContentTab, setActiveContentTab] = useState<ContentTabKey>('summary');
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(new Set());
  const [exportSheetVisible, setExportSheetVisible] = useState(false);

  if (!id) {
    return <ErrorState message="Không tìm thấy cuộc họp." onRetry={() => router.back()} />;
  }

  if (meetingQuery.isPending) {
    return <LoadingState />;
  }

  if (meetingQuery.isError) {
    return (
      <ErrorState
        message={getErrorMessage(meetingQuery.error)}
        onRetry={() => meetingQuery.refetch()}
      />
    );
  }

  const meeting = meetingQuery.data;
  const isReady = meeting.status === MeetingStatus.READY;

  function handleTabChange(key: string) {
    if (key === 'summary' || key === 'action-items') {
      setActiveContentTab(key);
      return;
    }
    if (key === 'transcript') {
      router.push({ pathname: MEETING_TRANSCRIPT_ROUTE, params: { id: meeting.id } });
      return;
    }
    if (key === 'graph') {
      router.push({ pathname: MEETING_GRAPH_ROUTE, params: { id: meeting.id } });
    }
  }

  function toggleActionItem(itemId: string) {
    setCheckedIds((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function handleTitleSave(title: string) {
    updateMeetingMutation.mutate({ title });
  }

  function handleRetry() {
    reindexMutation.mutate({ scope: 'changed' });
  }

  function handleExport(format: 'markdown' | 'pdf', sections: readonly ExportSection[]) {
    exportMutation.mutate(
      { format, sections },
      {
        onSuccess: () => setExportSheetVisible(false),
        onError: (error) => Alert.alert('Xuất thất bại', getErrorMessage(error)),
      },
    );
  }

  return (
    <ScreenSurface>
      <ScreenHeader
        onBack={() => router.back()}
        title="Chi tiết cuộc họp"
        trailing={
          <Pressable
            accessibilityLabel="Xuất cuộc họp"
            accessibilityRole="button"
            onPress={() => setExportSheetVisible(true)}
            testID="meeting-detail-kebab"
          >
            <AppIcon color={colors.text} name="more" size={22} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <MeetingDetailHero
          hasUnprocessedEdits={meeting.has_unprocessed_edits}
          meeting={meeting}
          onTitleSave={handleTitleSave}
        />
        <MeetingProcessingStatus
          failureReason={meeting.failure_reason}
          onRetry={handleRetry}
          processingSteps={meeting.processing_steps}
          retryLoading={reindexMutation.isPending}
          status={meeting.status}
        />
        <SegmentedTabs activeKey={activeContentTab} items={TAB_ITEMS} onChange={handleTabChange} />
        {isReady && activeContentTab === 'summary' ? (
          <MeetingSummarySection summary={toMeetingSummary(meeting.id, meeting.summary)} />
        ) : null}
        {isReady ? (
          <ActionItemsSection
            checkedIds={checkedIds}
            items={meeting.action_items.map(toActionItem)}
            onToggle={toggleActionItem}
          />
        ) : null}
      </ScrollView>
      <ExportSheet
        exporting={exportMutation.isPending}
        onClose={() => setExportSheetVisible(false)}
        onExport={handleExport}
        visible={exportSheetVisible}
      />
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
});
