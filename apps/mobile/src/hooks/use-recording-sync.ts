import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getRecordingRuntime } from '../recording/recording-runtime';
import { useMeQuery } from './use-me-query';

/**
 * Tells the transcript sync worker who is signed in (only their queued meetings sync — a shared
 * phone never uploads one person's meeting into another's account) and nudges it whenever the
 * app returns to the foreground, where a dropped connection is most likely to have come back.
 */
export function useRecordingSync(): void {
  const userId = useMeQuery().data?.user.id ?? null;

  useEffect(() => {
    let cancelled = false;
    void getRecordingRuntime()
      .then(({ worker }) => {
        if (!cancelled) worker.setOwner(userId);
      })
      .catch(() => undefined); // no local database → nothing queued to sync
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void getRecordingRuntime().then(({ worker }) => worker.kick(), () => undefined);
    });
    return () => subscription.remove();
  }, []);
}
