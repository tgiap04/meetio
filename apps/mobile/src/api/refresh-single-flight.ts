/**
 * Coalesces concurrent calls to an async operation into a single in-flight
 * promise. Built for token refresh: three requests failing with 401 at the
 * same moment must trigger exactly one `/auth/refresh` call — the refresh
 * token rotates on every use, so a second concurrent refresh would send an
 * already-invalidated token and fail, tearing down a session that was
 * actually fine.
 *
 * The in-flight promise is cleared once it settles (success or failure) so a
 * later, genuinely new refresh is not permanently deduped away.
 */
export function createSingleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return function runSingleFlight(): Promise<T> {
    if (inFlight) {
      return inFlight;
    }

    inFlight = operation().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}
