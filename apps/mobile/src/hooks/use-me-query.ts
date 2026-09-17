import { useQuery } from '@tanstack/react-query';
import { getMe } from '../api/users';
import { useSessionStore } from '../store/session.store';

export const ME_QUERY_KEY = ['me'] as const;

/**
 * The one and only place `GetMeResponse` (profile, retention settings,
 * `recording_consent_at`, token usage) is cached. Screens that need the
 * profile — settings, the consent gate — read it from here, never from
 * Zustand.
 */
export function useMeQuery() {
  const authStatus = useSessionStore((state) => state.authStatus);

  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: getMe,
    enabled: authStatus === 'authenticated',
  });
}
