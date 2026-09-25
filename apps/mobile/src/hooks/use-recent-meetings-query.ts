import { useQuery } from '@tanstack/react-query';
import { listMeetings } from '../api/meetings';

const RECENT_MEETINGS_LIMIT = 3;

export const RECENT_MEETINGS_QUERY_KEY = ['meetings', 'recent'] as const;

/** Home tab's "Cuộc họp gần đây" section — the real first page of `/meetings`. */
export function useRecentMeetingsQuery() {
  return useQuery({
    queryKey: RECENT_MEETINGS_QUERY_KEY,
    queryFn: () => listMeetings({ limit: RECENT_MEETINGS_LIMIT }),
  });
}
