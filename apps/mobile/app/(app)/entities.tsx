import { useMemo, useState } from 'react';
import { FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { EntitiesListHeader } from '../../src/components/entities/entities-list-header';
import { EntityListRow } from '../../src/components/entities/entity-list-row';
import { EmptyState } from '../../src/components/empty-state';
import { LoadingState } from '../../src/components/loading-state';
import { ErrorState } from '../../src/components/error-state';
import { useInfiniteEntitiesQuery } from '../../src/hooks/use-entities-query';
import { useMergeSuggestionsQuery } from '../../src/hooks/use-merge-suggestions-query';
import { useDebouncedValue } from '../../src/hooks/use-debounced-value';
import { getErrorMessage } from '../../src/api/error-messages';
import { ENTITY_DETAIL_ROUTE, MERGE_SUGGESTIONS_ROUTE } from '../../src/navigation/app-routes';
import { entityChipToTypeQuery, type EntityChipKey } from '../../src/utils/entity-type-labels';
import { colors } from '../../src/theme/colors';

const SEARCH_DEBOUNCE_MS = 400;

/**
 * Entity-list screen (US-38), reached from screen 10's "Xem chi tiết", the
 * Search tab's Node chip / "Người" group, and directly from the tab bar's
 * settings entry once this phase adds it. No design crop exists for this
 * screen (clarifications.md 2026-09-26) — built in the existing visual
 * language (Library tab's search + chip + paged-list shape).
 */
export default function EntitiesListScreen() {
  const [queryText, setQueryText] = useState('');
  const [activeChip, setActiveChip] = useState<EntityChipKey>('all');
  const debouncedQuery = useDebouncedValue(queryText.trim(), SEARCH_DEBOUNCE_MS);

  const entitiesQuery = useInfiniteEntitiesQuery({
    type: entityChipToTypeQuery(activeChip),
    q: debouncedQuery === '' ? undefined : debouncedQuery,
  });
  const suggestionsQuery = useMergeSuggestionsQuery();

  const entities = useMemo(() => entitiesQuery.data?.pages.flatMap((page) => page.items) ?? [], [entitiesQuery.data]);
  const suggestionCount = suggestionsQuery.data?.items.length ?? 0;

  function handleEntityPress(id: string) {
    router.push({ pathname: ENTITY_DETAIL_ROUTE, params: { id } });
  }

  function handleLoadMore() {
    if (entitiesQuery.hasNextPage && !entitiesQuery.isFetchingNextPage) {
      entitiesQuery.fetchNextPage();
    }
  }

  const header = (
    <EntitiesListHeader
      activeChip={activeChip}
      mergeSuggestionCount={suggestionCount}
      onBack={() => router.back()}
      onChipChange={setActiveChip}
      onMergeSuggestionsPress={() => router.push(MERGE_SUGGESTIONS_ROUTE)}
      onQueryTextChange={setQueryText}
      queryText={queryText}
    />
  );

  if (entitiesQuery.isPending) {
    return (
      <ScreenSurface>
        {header}
        <LoadingState label="Đang tải danh sách thực thể…" />
      </ScreenSurface>
    );
  }

  if (entitiesQuery.isError) {
    return (
      <ScreenSurface>
        {header}
        <ErrorState message={getErrorMessage(entitiesQuery.error)} onRetry={() => entitiesQuery.refetch()} />
      </ScreenSurface>
    );
  }

  return (
    <ScreenSurface>
      <FlatList
        contentContainerStyle={styles.container}
        data={entities}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            description={
              debouncedQuery !== '' || activeChip !== 'all' ? 'Thử một từ khóa hoặc bộ lọc khác.' : undefined
            }
            title="Chưa có thực thể nào"
          />
        }
        ListFooterComponent={
          entitiesQuery.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.footerSpinner} testID="entities-load-more-spinner" />
          ) : null
        }
        ListHeaderComponent={header}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => <EntityListRow entity={item} onPress={() => handleEntityPress(item.id)} />}
        style={styles.list}
      />
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: 16, paddingBottom: 32, gap: 2 },
  footerSpinner: { paddingVertical: 16 },
});
