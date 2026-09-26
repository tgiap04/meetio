import { useQuery } from '@tanstack/react-query';
import { getMeetingGraph } from '../api/entities';

export function meetingGraphQueryKey(meetingId: string) {
  return ['meeting-graph', meetingId] as const;
}

/** `GET /meetings/:id/graph` — screen 10's real data (US-38). */
export function useMeetingGraphQuery(meetingId: string, enabled = true) {
  return useQuery({
    queryKey: meetingGraphQueryKey(meetingId),
    queryFn: () => getMeetingGraph(meetingId),
    enabled: enabled && meetingId.length > 0,
  });
}
