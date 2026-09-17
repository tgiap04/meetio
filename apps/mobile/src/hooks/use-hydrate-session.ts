import { useEffect } from 'react';
import { readTokens } from '../storage/secure-store';
import { useSessionStore } from '../store/session.store';

/**
 * Reads any persisted token pair from secure storage once, on mount, and
 * resolves `authStatus` out of `'hydrating'`. This is what lets a user close
 * the app and reopen it still logged in (US-02).
 */
export function useHydrateSession(): void {
  const finishHydration = useSessionStore((state) => state.finishHydration);

  useEffect(() => {
    let cancelled = false;

    readTokens()
      .then((tokens) => {
        if (!cancelled) {
          finishHydration(tokens);
        }
      })
      .catch(() => {
        if (!cancelled) {
          finishHydration(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [finishHydration]);
}
