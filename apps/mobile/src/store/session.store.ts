import { create } from 'zustand';

/**
 * Zustand session store — LOCAL STATE ONLY.
 *
 * This store must never hold data that came back from the API (profile,
 * meetings, transcripts, …). That belongs to TanStack Query, which owns
 * caching/dedup/invalidation for server data. Mixing the two creates two
 * sources of truth for the same entity that can silently drift apart.
 *
 * What this store legitimately owns:
 *  - the access/refresh token pair (also mirrored to secure storage)
 *  - whether the session has finished hydrating from secure storage yet
 *
 * `authStatus` is derived, not server data — it is a pure function of
 * "do we hold a token pair right now," which is exactly the kind of local,
 * device-side fact Zustand is for.
 */
export type AuthStatus = 'hydrating' | 'authenticated' | 'unauthenticated';

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  authStatus: AuthStatus;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  clearTokens: () => void;
  finishHydration: (tokens: { accessToken: string; refreshToken: string } | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  accessToken: null,
  refreshToken: null,
  authStatus: 'hydrating',
  setTokens: ({ accessToken, refreshToken }) =>
    set({ accessToken, refreshToken, authStatus: 'authenticated' }),
  clearTokens: () => set({ accessToken: null, refreshToken: null, authStatus: 'unauthenticated' }),
  finishHydration: (tokens) =>
    set(
      tokens
        ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, authStatus: 'authenticated' }
        : { accessToken: null, refreshToken: null, authStatus: 'unauthenticated' },
    ),
}));
