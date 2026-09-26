import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { EntityMergeRecord, EntityRelation } from '@meetio/shared';
import { ScreenSurface } from '../../src/components/ui/screen-surface';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { LoadingState } from '../../src/components/loading-state';
import { ErrorState } from '../../src/components/error-state';
import { EntityHeaderCard } from '../../src/components/entities/entity-header-card';
import { EntityEditForm } from '../../src/components/entities/entity-edit-form';
import { EntityRelationsList } from '../../src/components/entities/entity-relations-list';
import { EntityMeetingsList } from '../../src/components/entities/entity-meetings-list';
import { EntityTimelineSection } from '../../src/components/entities/entity-timeline-section';
import { EntityMergesSection } from '../../src/components/entities/entity-merges-section';
import { useEntityDetailQuery } from '../../src/hooks/use-entity-detail-query';
import {
  useDeleteEntityMutation,
  useUndoMergeMutation,
  useUpdateEntityMutation,
} from '../../src/hooks/use-entity-mutations';
import { getErrorMessage } from '../../src/api/error-messages';
import { MEETING_DETAIL_ROUTE, MEETING_TRANSCRIPT_ROUTE } from '../../src/navigation/app-routes';

/**
 * Entity-detail screen (US-38/39/40/41). No design crop exists for it
 * (clarifications.md 2026-09-26) — built in the existing visual language.
 * Deliberately omits any "hỏi trong phạm vi thực thể" Q&A affordance —
 * deferred to Phase 15.
 */
export default function EntityDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [isEditing, setIsEditing] = useState(false);
  const [undoingIds, setUndoingIds] = useState<ReadonlySet<string>>(new Set());

  const query = useEntityDetailQuery(id ?? '', Boolean(id));
  const updateMutation = useUpdateEntityMutation(id ?? '');
  const deleteMutation = useDeleteEntityMutation();
  const undoMutation = useUndoMergeMutation();

  function handleRelationPress(relation: EntityRelation) {
    router.push({
      pathname: MEETING_TRANSCRIPT_ROUTE,
      params: { id: relation.meeting_id, seq: String(relation.segment_seq) },
    });
  }

  function handleMeetingPress(meetingId: string) {
    router.push({ pathname: MEETING_DETAIL_ROUTE, params: { id: meetingId } });
  }

  function handleTimelineItemPress(meetingId: string, segmentSeq: number) {
    router.push({ pathname: MEETING_TRANSCRIPT_ROUTE, params: { id: meetingId, seq: String(segmentSeq) } });
  }

  function handleSaveEdit(body: Parameters<typeof updateMutation.mutate>[0]) {
    updateMutation.mutate(body, { onSuccess: () => setIsEditing(false) });
  }

  function handleDeletePress() {
    if (!id || !query.data) {
      return;
    }
    Alert.alert('Xóa thực thể', `Xóa "${query.data.canonical_name}"? Không thể hoàn tác.`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(id, { onSuccess: () => router.back() }),
      },
    ]);
  }

  function handleUndoPress(merge: EntityMergeRecord) {
    setUndoingIds((prev) => new Set(prev).add(merge.id));
    undoMutation.mutate(merge.id, {
      onSettled: () =>
        setUndoingIds((prev) => {
          const next = new Set(prev);
          next.delete(merge.id);
          return next;
        }),
      onError: (error) => Alert.alert('Không thể hoàn tác', getErrorMessage(error)),
    });
  }

  if (!id) {
    return <ErrorState message="Không tìm thấy thực thể." onRetry={() => router.back()} />;
  }
  if (query.isPending) {
    return (
      <ScreenSurface>
        <ScreenHeader onBack={() => router.back()} title="Thực thể" />
        <LoadingState label="Đang tải thực thể…" />
      </ScreenSurface>
    );
  }
  if (query.isError || !query.data) {
    return (
      <ScreenSurface>
        <ScreenHeader onBack={() => router.back()} title="Thực thể" />
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} />
      </ScreenSurface>
    );
  }

  const entity = query.data;

  return (
    <ScreenSurface>
      <ScreenHeader onBack={() => router.back()} title={entity.canonical_name} />
      <ScrollView contentContainerStyle={styles.content}>
        {isEditing ? (
          <EntityEditForm
            initialName={entity.canonical_name}
            initialType={entity.type}
            onCancel={() => setIsEditing(false)}
            onSave={handleSaveEdit}
            saving={updateMutation.isPending}
          />
        ) : (
          <EntityHeaderCard
            entity={entity}
            onDeletePress={handleDeletePress}
            onEditPress={() => setIsEditing(true)}
          />
        )}
        <EntityRelationsList
          entityName={entity.canonical_name}
          entityType={entity.type}
          onRelationPress={handleRelationPress}
          relations={entity.relations}
        />
        <EntityMeetingsList meetings={entity.meetings} onMeetingPress={handleMeetingPress} />
        <EntityTimelineSection entityId={id} onItemPress={handleTimelineItemPress} />
        <EntityMergesSection merges={entity.merges} onUndoPress={handleUndoPress} undoingIds={undoingIds} />
      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 20 },
});
