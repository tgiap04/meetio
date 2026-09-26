import { useQuery } from '@tanstack/react-query';
import { getActionFilters } from '../api/actions';

export const ACTION_FILTERS_QUERY_KEY = ['action-filters'] as const;

/** `GET /actions/filters` (US-34) — one call for three things: the Home row's
 *  exact `open_total`, and the "Việc cần làm" screen's assignee and meeting
 *  filter chips. Replaces the earlier `/actions/assignees` +
 *  `GET /meetings?limit=20` workaround now that the backend exposes both in
 *  one endpoint. */
export function useActionFiltersQuery() {
  return useQuery({
    queryKey: ACTION_FILTERS_QUERY_KEY,
    queryFn: () => getActionFilters(),
  });
}
