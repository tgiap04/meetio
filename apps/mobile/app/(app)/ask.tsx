import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { AskGlobalRequest, QaCitation } from '@meetio/shared';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { ErrorState } from '../../src/components/error-state';
import { LoadingState } from '../../src/components/loading-state';
import { AppIcon } from '../../src/components/icons/app-icon';
import { QaThreadList } from '../../src/components/qa/qa-thread-list';
import { QaComposer } from '../../src/components/qa/qa-composer';
import { QaFilterBar, type QaQuestionFilters } from '../../src/components/qa/qa-filter-bar';
import { flattenQaHistoryPages, useGlobalQaHistoryQuery } from '../../src/hooks/use-qa-history-query';
import { useAskGlobalQuestionMutation, useDeleteGlobalQaHistoryMutation } from '../../src/hooks/use-qa-mutations';
import { useQaThread, type QaHistoryPageState } from '../../src/hooks/use-qa-thread';
import { getErrorMessage } from '../../src/api/error-messages';
import { MEETING_TRANSCRIPT_ROUTE } from '../../src/navigation/app-routes';
import { colors } from '../../src/theme/colors';

/**
 * Global, cross-meeting Q&A chat (US-37/39) — one thread. Reached from
 * Home's "Hỏi AI về các cuộc họp" row, or from entity detail's "Hỏi về thực
 * thể này" with `entityId`/`entityName` preselecting that entity as the
 * question filter (clarifications.md 2026-09-26).
 */
export default function AskScreen() {
  const { entityId, entityName } = useLocalSearchParams<{ entityId?: string; entityName?: string }>();

  const [filters, setFilters] = useState<QaQuestionFilters>({
    from: null,
    to: null,
    entityId: entityId ?? null,
    entityName: entityName ?? null,
  });

  const historyQuery = useGlobalQaHistoryQuery();
  const askMutation = useAskGlobalQuestionMutation();
  const deleteMutation = useDeleteGlobalQaHistoryMutation();

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

  const thread = useQaThread<AskGlobalRequest>(history, askMutation, deleteMutation);

  function handleCitationPress(citation: QaCitation) {
    if (!citation.available) {
      return;
    }
    router.push({
      pathname: MEETING_TRANSCRIPT_ROUTE,
      params: { id: citation.meeting_id, seq: String(citation.segment_seq) },
    });
  }

  function handleSend(question: string) {
    const request: AskGlobalRequest = {
      question,
      from: filters.from ?? undefined,
      to: filters.to ?? undefined,
      entity_id: filters.entityId ?? undefined,
    };
    thread.send(request, question);
  }

  function handleDeleteHistory() {
    Alert.alert('Xóa lịch sử', 'Xóa toàn bộ lịch sử hỏi đáp?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => thread.deleteHistory().catch((error: unknown) => Alert.alert('Không thể xóa', getErrorMessage(error))),
      },
    ]);
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
            testID="ask-delete-history"
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
          <QaFilterBar filters={filters} onChange={setFilters} />
          <QaComposer onSend={handleSend} placeholder="Hỏi AI về các cuộc họp…" sending={thread.isSending} />
        </KeyboardAvoidingView>
      )}
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
