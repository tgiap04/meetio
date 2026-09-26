import { useQuery } from '@tanstack/react-query';
import { getMeetingActions } from '../api/actions';

export function meetingActionsQueryKey(meetingId: string) {
  return ['meeting-actions', meetingId] as const;
}

/** The Action Items tab's real data source (US-32) — `GET /meetings/:id/actions`,
 *  already ordered open first, done last, so the tab never has to re-sort. */
export function useMeetingActionsQuery(meetingId: string | undefined) {
  return useQuery({
    queryKey: meetingActionsQueryKey(meetingId ?? ''),
    queryFn: () => getMeetingActions(meetingId as string),
    enabled: Boolean(meetingId),
  });
}
