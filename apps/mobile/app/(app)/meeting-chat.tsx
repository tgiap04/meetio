import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { AskMeetingRequest, QaCitation } from '@meetio/shared';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { ErrorState } from '../../src/components/error-state';
import { LoadingState } from '../../src/components/loading-state';
import { AppIcon } from '../../src/components/icons/app-icon';
import { QaThreadList } from '../../src/components/qa/qa-thread-list';
import { QaComposer } from '../../src/components/qa/qa-composer';
import { QaNotReadyNotice } from '../../src/components/qa/qa-not-ready-notice';
import { flattenQaHistoryPages, useMeetingQaHistoryQuery } from '../../src/hooks/use-qa-history-query';
import { useAskMeetingQuestionMutation, useDeleteMeetingQaHistoryMutation } from '../../src/hooks/use-qa-mutations';
import { useQaThread, type QaHistoryPageState } from '../../src/hooks/use-qa-thread';
import { getErrorMessage } from '../../src/api/error-messages';
import { MEETING_TRANSCRIPT_ROUTE } from '../../src/navigation/app-routes';
import { colors } from '../../src/theme/colors';

/**
 * Meeting-scoped Q&A chat (US-35/36) — reached from the "Hỏi AI" floating
 * button on meeting detail (clarifications.md 2026-09-26). No design crop
 * exists for it; built in the existing visual language.
 */
export default function MeetingChatScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const meetingId = id ?? '';

  const historyQuery = useMeetingQaHistoryQuery(meetingId, Boolean(id));
  const askMutation = useAskMeetingQuestionMutation(meetingId);
  const deleteMutation = useDeleteMeetingQaHistoryMutation(meetingId);

  const history: QaHistoryPageState = {
    items: flattenQaHistoryPages(historyQuery.data?.pages),
    isPending: historyQuery.isPending,
    isError: historyQuery.isError,
    error: historyQuery.error,
    refetch: () => historyQuery.refetch(),
    hasNextPage: Boolean(historyQuery.hasNextPage),
    isFetchingNextPage: historyQuery.isFetchingNextPage,
    fetchNextPage: () => historyQuery.fetchNextPage(),
  };

  const thread = useQaThread<AskMeetingRequest>(history, askMutation, deleteMutation);

  function handleCitationPress(citation: QaCitation) {
    if (!citation.available) {
      return;
    }
    router.push({
      pathname: MEETING_TRANSCRIPT_ROUTE,
      params: { id: citation.meeting_id, seq: String(citation.segment_seq) },
    });
  }

  function handleDeleteHistory() {
    Alert.alert('Xóa lịch sử', 'Xóa toàn bộ lịch sử hỏi đáp của cuộc họp này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => thread.deleteHistory().catch((error: unknown) => Alert.alert('Không thể xóa', getErrorMessage(error))),
      },
    ]);
  }

  if (!id) {
    return <ErrorState message="Không tìm thấy cuộc họp." onRetry={() => router.back()} />;
  }

  return (
    <ScreenSurface>
      <ScreenHeader
        onBack={() => router.back()}
        title="Hỏi AI"
        trailing={
          <Pressable
            accessibilityLabel="Xóa lịch sử"
            accessibilityRole="button"
            onPress={handleDeleteHistory}
            testID="meeting-chat-delete-history"
          >
            <AppIcon color={colors.text} name="trash" size={22} />
          </Pressable>
        }
      />
      {historyQuery.isPending ? (
        <LoadingState label="Đang tải lịch sử…" />
      ) : historyQuery.isError ? (
        <ErrorState message={getErrorMessage(historyQuery.error)} onRetry={() => historyQuery.refetch()} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <QaThreadList
            hasOlder={history.hasNextPage}
            items={thread.items}
            loadingOlder={history.isFetchingNextPage}
            onCitationPress={handleCitationPress}
            onLoadOlder={history.fetchNextPage}
            onRetryPending={thread.retry}
            pending={thread.pending}
          />
          {thread.meetingNotReady ? (
            <QaNotReadyNotice />
          ) : (
            <QaComposer
              onSend={(question) => thread.send({ question }, question)}
              placeholder="Hỏi về cuộc họp này…"
              sending={thread.isSending}
            />
          )}
        </KeyboardAvoidingView>
      )}
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
