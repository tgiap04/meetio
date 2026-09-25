import { useQuery } from '@tanstack/react-query';
import { getMeeting } from '../api/meetings';

export function meetingQueryKey(id: string) {
  return ['meeting', id] as const;
}

/** Screen 08's real data source — summary, action items, status, `has_unprocessed_edits`. */
export function useMeetingQuery(id: string | undefined) {
  return useQuery({
    queryKey: meetingQueryKey(id ?? ''),
    queryFn: () => getMeeting(id as string),
    enabled: Boolean(id),
  });
}
