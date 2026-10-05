import { useEffect, useRef } from 'react';
import { useRecentMeetingsQuery } from './use-recent-meetings-query';
import { useActionFiltersQuery } from './use-action-filters-query';
import { useRecordingStore } from '../recording/recording.store';
import { useAppLockStore } from '../security/app-lock.store';
import { useSessionStore } from '../store/session.store';
import { buildWidgetSnapshot, sameWidgetContent, SIGNED_OUT_SNAPSHOT, type WidgetSnapshot } from '../widget/widget-snapshot';
import { publishWidgetSnapshot } from '../widget/widget-publisher';

export const WIDGET_SYNC_DEBOUNCE_MS = 1000;

/**
 * Keeps the home-screen widget in step with the signed-in app (mounted by the `(app)` layout).
 * Reuses the Home tab's own queries, so a new meeting or a ticked-off to-do — which already
 * invalidate them — reaches the widget with no extra request. Debounced, and skipped when nothing
 * visible changed.
 */
export function useWidgetSnapshotSync(now: () => number = Date.now): void {
  const latestMeeting = useRecentMeetingsQuery().data?.items[0];
  const openActions = useActionFiltersQuery().data?.open_total;
  const recordingPhase = useRecordingStore((s) => s.phase);
  const appLockEnabled = useAppLockStore((s) => s.enabled);
  // Until the lock flag is read, `enabled` is a default, not a fact — publishing then could put a
  // title on the home screen of a phone whose owner turned the lock on.
  const lockKnown = useAppLockStore((s) => s.status === 'ready');
  const lastPublished = useRef<WidgetSnapshot | null>(null);

  useEffect(() => {
    if (!lockKnown) return;
    const timer = setTimeout(() => {
      const next = buildWidgetSnapshot({ latestMeeting, openActions, recordingPhase, appLockEnabled, now: now() });
      if (lastPublished.current && sameWidgetContent(lastPublished.current, next)) return;
      lastPublished.current = next;
      void publishWidgetSnapshot(next);
    }, WIDGET_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [latestMeeting, openActions, recordingPhase, appLockEnabled, lockKnown, now]);
}

/**
 * Root-layout half: once signed out, the widget must stop showing the previous account's meeting.
 * Lives at the root because logout unmounts the `(app)` layout — and its sync hook — immediately.
 */
export function useWidgetSignedOutSync(): void {
  const authStatus = useSessionStore((s) => s.authStatus);
  useEffect(() => {
    if (authStatus === 'unauthenticated') void publishWidgetSnapshot(SIGNED_OUT_SNAPSHOT);
  }, [authStatus]);
}
