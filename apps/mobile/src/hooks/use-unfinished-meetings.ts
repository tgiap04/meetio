import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listMeetings } from '../api/meetings';
import { useRecordingStore } from '../recording/recording.store';
import { listUnfinishedMeetings } from '../recording/recording-recovery';
import { MEETINGS_QUERY_KEY } from './use-meetings-query';
import { useMeQuery } from './use-me-query';

export const UNFINISHED_MEETINGS_QUERY_KEY = [...MEETINGS_QUERY_KEY, 'unfinished'] as const;

/**
 * US-15: meetings still `recording`/`paused` — on this device's queue or on the server — other
 * than the one being recorded right now. Re-read whenever the sync status changes, so a meeting
 * that finished syncing leaves the list by itself. Offline, the server half is simply skipped.
 */
export function useUnfinishedMeetings() {
  const ownerId = useMeQuery().data?.user.id;
  const sync = useRecordingStore((s) => s.sync);
  const activeId = useRecordingStore((s) => s.meetingId);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...UNFINISHED_MEETINGS_QUERY_KEY, ownerId, activeId, sync.pending, sync.online],
    enabled: Boolean(ownerId),
    queryFn: async () => {
      const server = await Promise.all([listMeetings({ status: 'recording', limit: 20 }), listMeetings({ status: 'paused', limit: 20 })])
        .then(([recording, paused]) => [...recording.items, ...paused.items])
        .catch(() => []);
      return listUnfinishedMeetings(ownerId as string, server);
    },
  });

  return {
    meetings: query.data ?? [],
    refresh: () => queryClient.invalidateQueries({ queryKey: UNFINISHED_MEETINGS_QUERY_KEY }),
  };
}
