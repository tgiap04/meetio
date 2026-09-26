import { useState } from 'react';
import { Alert } from 'react-native';
import type { MeetingActionItem } from '@meetio/shared';
import { ActionStatus } from '@meetio/shared';
import { ActionItemsSection } from './action-items-section';
import { ActionItemEditSheet, type ActionItemEditSheetPayload } from './action-item-edit-sheet';
import { LoadingState } from '../loading-state';
import { ErrorState } from '../error-state';
import { useMeetingActionsQuery } from '../../hooks/use-meeting-actions-query';
import { useCreateActionItemMutation, useDeleteActionItemMutation, useUpdateActionItemMutation } from '../../hooks/use-action-mutations';
import { getErrorMessage } from '../../api/error-messages';

type SheetState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; item: MeetingActionItem };

export interface ActionItemsTabProps {
  meetingId: string;
  onOpenTranscript: (segmentSeq: number) => void;
}

/**
 * Owns the Action Items tab's real data (US-32/33): the dedicated
 * `GET /meetings/:id/actions` list (already open-first/done-last), every
 * mutation (tick, edit, add, delete), and the add/edit sheet's open state —
 * kept out of `meeting-detail.tsx` so that screen stays a thin shell.
 */
export function ActionItemsTab({ meetingId, onOpenTranscript }: ActionItemsTabProps) {
  const actionsQuery = useMeetingActionsQuery(meetingId);
  const createMutation = useCreateActionItemMutation(meetingId);
  const updateMutation = useUpdateActionItemMutation();
  const deleteMutation = useDeleteActionItemMutation();
  const [sheet, setSheet] = useState<SheetState>({ mode: 'closed' });

  if (actionsQuery.isPending) {
    return <LoadingState label="Đang tải action items…" />;
  }

  if (actionsQuery.isError) {
    return <ErrorState message={getErrorMessage(actionsQuery.error)} onRetry={() => actionsQuery.refetch()} />;
  }

  function handleToggle(id: string) {
    const target = actionsQuery.data?.items.find((candidate) => candidate.id === id);
    if (!target) {
      return;
    }
    const nextStatus = target.status === ActionStatus.DONE ? ActionStatus.OPEN : ActionStatus.DONE;
    updateMutation.mutate({ id, body: { status: nextStatus } });
  }

  function handleDelete(item: MeetingActionItem) {
    Alert.alert('Xóa việc cần làm', `Xóa "${item.content}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => deleteMutation.mutate({ id: item.id, meetingId: item.meeting_id }),
      },
    ]);
  }

  function handleSheetSave(payload: ActionItemEditSheetPayload) {
    if (sheet.mode === 'edit') {
      updateMutation.mutate(
        { id: sheet.item.id, body: payload },
        { onSuccess: () => setSheet({ mode: 'closed' }) },
      );
      return;
    }
    createMutation.mutate(payload, { onSuccess: () => setSheet({ mode: 'closed' }) });
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <ActionItemsSection
        items={actionsQuery.data.items}
        onAddPress={() => setSheet({ mode: 'create' })}
        onDelete={handleDelete}
        onEdit={(item) => setSheet({ mode: 'edit', item })}
        onOpenTranscript={onOpenTranscript}
        onToggle={handleToggle}
      />
      <ActionItemEditSheet
        item={sheet.mode === 'edit' ? sheet.item : undefined}
        onClose={() => setSheet({ mode: 'closed' })}
        onSave={handleSheetSave}
        saving={saving}
        visible={sheet.mode !== 'closed'}
      />
    </>
  );
}
