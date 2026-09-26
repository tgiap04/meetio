import { useMemo, useState } from 'react';
import { FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ActionStatus, type ActionListItem } from '@meetio/shared';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { ActionsListHeader, ACTIONS_FILTER_ALL_KEY } from '../../src/components/actions-list-header';
import { ActionItemRow } from '../../src/components/action-item-row';
import { EmptyState } from '../../src/components/empty-state';
import { LoadingState } from '../../src/components/loading-state';
import { ErrorState } from '../../src/components/error-state';
import { useInfiniteActionsListQuery } from '../../src/hooks/use-actions-list-query';
import { useActionFiltersQuery } from '../../src/hooks/use-action-filters-query';
import { useUpdateActionItemMutation } from '../../src/hooks/use-action-mutations';
import { getErrorMessage } from '../../src/api/error-messages';
import { MEETING_DETAIL_ROUTE } from '../../src/navigation/app-routes';
import { colors } from '../../src/theme/colors';

/**
 * "Việc cần làm" (US-34) — the cross-meeting action-item list: open items by
 * default, a toggle to fold in done ones (done still sorts last, per
 * `GET /actions`'s own contract), filter chips by assignee and by meeting,
 * infinite scroll by `next_offset`. Reached from Home's secondary row
 * (clarifications.md 2026-09-26) — no tab-bar entry.
 */
export default function ActionsScreen() {
  const [includeDone, setIncludeDone] = useState(false);
  const [activeAssigneeKey, setActiveAssigneeKey] = useState<string>(ACTIONS_FILTER_ALL_KEY);
  const [activeMeetingKey, setActiveMeetingKey] = useState<string>(ACTIONS_FILTER_ALL_KEY);

  const filtersQuery = useActionFiltersQuery();
  const actionsQuery = useInfiniteActionsListQuery({
    status: includeDone ? undefined : ActionStatus.OPEN,
    assignee_entity_id: activeAssigneeKey === ACTIONS_FILTER_ALL_KEY ? undefined : activeAssigneeKey,
    meeting_id: activeMeetingKey === ACTIONS_FILTER_ALL_KEY ? undefined : activeMeetingKey,
  });
  const updateMutation = useUpdateActionItemMutation();

  const items = useMemo(() => actionsQuery.data?.pages.flatMap((page) => page.items) ?? [], [actionsQuery.data]);

  const assigneeChips = useMemo(
    () => [
      { key: ACTIONS_FILTER_ALL_KEY, label: 'Tất cả' },
      ...(filtersQuery.data?.assignees.map((assignee) => ({ key: assignee.id, label: assignee.canonical_name })) ?? []),
    ],
    [filtersQuery.data],
  );
  const meetingChips = useMemo(
    () => [
      { key: ACTIONS_FILTER_ALL_KEY, label: 'Tất cả' },
      ...(filtersQuery.data?.meetings.map((meeting) => ({ key: meeting.id, label: meeting.title })) ?? []),
    ],
    [filtersQuery.data],
  );

  function handleToggle(id: string) {
    const target = items.find((candidate) => candidate.id === id);
    if (!target) {
      return;
    }
    const nextStatus = target.status === ActionStatus.DONE ? ActionStatus.OPEN : ActionStatus.DONE;
    updateMutation.mutate({ id, body: { status: nextStatus } });
  }

  function handlePress(meetingId: string) {
    router.push({ pathname: MEETING_DETAIL_ROUTE, params: { id: meetingId } });
  }

  function handleLoadMore() {
    if (actionsQuery.hasNextPage && !actionsQuery.isFetchingNextPage) {
      actionsQuery.fetchNextPage();
    }
  }

  const header = (
    <ActionsListHeader
      activeAssigneeKey={activeAssigneeKey}
      activeMeetingKey={activeMeetingKey}
      assigneeChips={assigneeChips}
      includeDone={includeDone}
      meetingChips={meetingChips}
      onAssigneeChange={setActiveAssigneeKey}
      onBack={() => router.back()}
      onIncludeDoneChange={setIncludeDone}
      onMeetingChange={setActiveMeetingKey}
    />
  );

  if (actionsQuery.isPending) {
    return (
      <ScreenSurface>
        {header}
        <LoadingState label="Đang tải việc cần làm…" />
      </ScreenSurface>
    );
  }

  if (actionsQuery.isError) {
    return (
      <ScreenSurface>
        {header}
        <ErrorState message={getErrorMessage(actionsQuery.error)} onRetry={() => actionsQuery.refetch()} />
      </ScreenSurface>
    );
  }

  return (
    <ScreenSurface>
      <FlatList
        contentContainerStyle={styles.container}
        data={items}
        keyExtractor={(item: ActionListItem) => item.id}
        ListEmptyComponent={<EmptyState title="Chưa có việc cần làm" />}
        ListFooterComponent={
          actionsQuery.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.footerSpinner} testID="actions-load-more-spinner" />
          ) : null
        }
        ListHeaderComponent={header}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => <ActionItemRow item={item} onPress={handlePress} onToggle={handleToggle} />}
        style={styles.list}
      />
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  footerSpinner: { paddingVertical: 16 },
});
