import { ApiErrorCode } from '@meetio/shared';
import { bulkUpsertSegments, createMeeting, transitionMeeting } from '../api/recording';
import { listSegments } from '../api/meetings';
import { queryClient } from '../query/query-client';
import { MEETINGS_QUERY_KEY } from '../hooks/use-meetings-query';
import { openQueueDb } from '../queue/queue-db';
import { createMeetingSocket } from '../queue/meeting-socket';
import { createSyncWorker, type SyncWorker } from '../queue/sync-worker';
import { expoSttEngine, getOnDeviceLocales } from './expo-stt-engine';
import { purgeStaleChunks } from './server-stt-native';
import { serverRecognitionEngine } from './server-stream-stt-native';
import { resolveRecognitionMode } from './stt-engine';
import { startKeepalive, stopKeepalive } from './background-keepalive';
import { newClientId } from './client-id';
import { createRecordingSession, type RecordingSession } from './recording-session';
import { useRecordingStore } from './recording.store';

/**
 * The app-wide recording singletons: one queue database, one sync worker, one session. Created
 * lazily on first use (the SQLite open is async) and shared by the recording screens, the Home
 * banner and the app layout that tells the worker who is signed in.
 */
export interface RecordingRuntime {
  worker: SyncWorker;
  session: RecordingSession;
}

const schedule = (fn: () => void, ms: number) => {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
};

async function loadAllSegments(meetingId: string) {
  const items = [];
  for (let from: number | null = 0; from !== null; ) {
    const page = await listSegments(meetingId, { from_seq: from, limit: 500 });
    items.push(...page.items);
    from = page.next_from_seq;
  }
  return items;
}

let runtime: Promise<RecordingRuntime> | null = null;

export function getRecordingRuntime(): Promise<RecordingRuntime> {
  runtime ??= openQueueDb().then((db) => {
    purgeStaleChunks(); // audio chunks a killed app never got to delete
    let session: RecordingSession | null = null;
    const worker = createSyncWorker({
      db,
      api: { createMeeting, transitionMeeting, bulkUpsertSegments },
      now: Date.now,
      schedule,
      makeRealtime: createMeetingSocket,
      onStatus: (sync) => useRecordingStore.setState({ sync }),
      onMeetingSynced: (meetingId) => {
        session?.finish(meetingId);
        void queryClient.invalidateQueries({ queryKey: MEETINGS_QUERY_KEY });
      },
      onMeetingBlocked: (meetingId, code) => {
        if (useRecordingStore.getState().meetingId !== meetingId) return;
        useRecordingStore.setState({
          problem:
            code === ApiErrorCode.CONSENT_REQUIRED
              ? 'Máy chủ chưa nhận cuộc họp này vì bạn chưa đồng ý nội dung xử lý dữ liệu mới. Transcript vẫn được giữ trên máy.'
              : 'Máy chủ từ chối cuộc họp này. Transcript vẫn được giữ trên máy.',
        });
      },
    });
    session = createRecordingSession({
      engineFor: (mode) => (mode === 'server' ? serverRecognitionEngine : expoSttEngine),
      resolveMode: async () => resolveRecognitionMode(await getOnDeviceLocales()),
      db: openQueueDb,
      worker,
      keepalive: { start: startKeepalive, stop: stopKeepalive },
      loadServerSegments: loadAllSegments,
      now: Date.now,
      schedule,
      newId: newClientId,
    });
    return { worker, session };
  });
  return runtime;
}
