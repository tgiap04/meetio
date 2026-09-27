import { useCallback, useState } from 'react';
import { getRecordingRuntime } from '../recording/recording-runtime';
import type { RecordingSession } from '../recording/recording-session';

/**
 * Runs one session command at a time (pause / resume / end / resume-unfinished), exposing `busy`
 * so a double tap cannot fire two transitions. Failures surface as `error` — the local queue
 * already holds everything recorded, so nothing is lost when a command fails.
 */
export function useRecordingActions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(command: (session: RecordingSession) => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await command((await getRecordingRuntime()).session);
    } catch {
      setError('Không thực hiện được thao tác. Transcript vẫn được giữ trên máy — thử lại.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { run, busy, error };
}
