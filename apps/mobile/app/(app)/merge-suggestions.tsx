import { Alert, FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import type { EntitySummary, MergeSuggestion } from '@meetio/shared';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { EmptyState } from '../../src/components/empty-state';
import { LoadingState } from '../../src/components/loading-state';
import { ErrorState } from '../../src/components/error-state';
import { MergeSuggestionCard } from '../../src/components/merge-suggestion-card';
import { useMergeSuggestionsQuery } from '../../src/hooks/use-merge-suggestions-query';
import { useMergeEntitiesMutation, useRejectMergeSuggestionMutation, useUndoMergeMutation } from '../../src/hooks/use-entity-mutations';
import { getErrorMessage } from '../../src/api/error-messages';
import { colors } from '../../src/theme/colors';

/**
 * Merge-review screen (US-40) — every pending `GET /entities/merge-suggestions`
 * row, each mergeable (keep one, choose which) or rejectable. A merge is
 * followed by an immediate "Hoàn tác" using the returned merge record's id;
 * later (up to 30 days) the entity-detail screen's "Đã gộp" section undoes it.
 */
export default function MergeSuggestionsScreen() {
  const query = useMergeSuggestionsQuery();
  const mergeMutation = useMergeEntitiesMutation();
  const rejectMutation = useRejectMergeSuggestionMutation();
  const undoMutation = useUndoMergeMutation();

  function offerUndo(mergeId: string, mergedName: string) {
    Alert.alert('Đã gộp', `"${mergedName}" giờ là bí danh. Có thể tách lại trong 30 ngày.`, [
      { text: 'Xong', style: 'cancel' },
      {
        text: 'Hoàn tác',
        onPress: () => undoMutation.mutate(mergeId, { onError: (error) => Alert.alert('Không thể hoàn tác', getErrorMessage(error)) }),
      },
    ]);
  }

  function handleMergePress(keep: EntitySummary, mergeAway: EntitySummary) {
    Alert.alert('Gộp thực thể', `Gộp "${mergeAway.canonical_name}" vào "${keep.canonical_name}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Gộp',
        onPress: () =>
          mergeMutation.mutate(
            { keep_id: keep.id, merge_ids: [mergeAway.id] },
            {
              onSuccess: (result) => {
                const record = result.merges[0];
                if (record) offerUndo(record.id, record.merged_name);
              },
              onError: (error) => Alert.alert('Không thể gộp', getErrorMessage(error)),
            },
          ),
      },
    ]);
  }

  function handleRejectPress(suggestion: MergeSuggestion) {
    rejectMutation.mutate(suggestion.id, {
      onError: (error) => Alert.alert('Không thể bỏ qua', getErrorMessage(error)),
    });
  }

  return (
    <ScreenSurface>
      <ScreenHeader onBack={() => router.back()} title="Đề xuất gộp" />
      {query.isPending ? <LoadingState label="Đang tải đề xuất gộp…" /> : null}
      {query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : null}
      {!query.isPending && !query.isError ? (
        <FlatList
          contentContainerStyle={styles.container}
          data={query.data?.items ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState description="Không có thực thể nào đang chờ gộp." title="Không có đề xuất" />}
          renderItem={({ item }) => (
            <MergeSuggestionCard
              onMergePress={handleMergePress}
              onRejectPress={() => handleRejectPress(item)}
              suggestion={item}
            />
          )}
        />
      ) : null}
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 16, gap: 12, backgroundColor: colors.surface },
});
