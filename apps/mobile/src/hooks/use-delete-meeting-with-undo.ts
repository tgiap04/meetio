import { useCallback, useEffect, useRef, useState } from 'react';
import { useDeleteMeetingMutation } from './use-meeting-mutations';

const UNDO_WINDOW_MS = 10_000;

export interface UseDeleteMeetingWithUndoResult {
  /** The meeting currently counting down to deletion, or `null`. A screen
   *  filters this id out of its rendered list and shows the undo affordance
   *  for it. */
  pendingDeleteId: string | null;
  startDelete: (id: string) => void;
  undoDelete: () => void;
}

/**
 * Client-side 10s undo window (US-26): the DELETE request is scheduled with
 * `setTimeout` and only actually sent once the window elapses without
 * `undoDelete` being called first — never delete-then-restore.
 *
 * Starting a new delete while one is already pending fires the earlier one
 * immediately would be surprising, so instead it simply replaces it: only
 * one meeting can be mid-undo at a time, matching a single swipe-to-delete
 * row's affordance.
 */
export function useDeleteMeetingWithUndo(): UseDeleteMeetingWithUndoResult {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteMutation = useDeleteMeetingMutation();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Unmounting cancels any pending timer rather than deleting behind the
  // screen's back — there is no toast left to offer undo once it's gone.
  useEffect(() => clearTimer, [clearTimer]);

  const startDelete = useCallback(
    (id: string) => {
      clearTimer();
      setPendingDeleteId(id);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setPendingDeleteId(null);
        deleteMutation.mutate(id);
      }, UNDO_WINDOW_MS);
    },
    [clearTimer, deleteMutation],
  );

  const undoDelete = useCallback(() => {
    clearTimer();
    setPendingDeleteId(null);
  }, [clearTimer]);

  return { pendingDeleteId, startDelete, undoDelete };
}
