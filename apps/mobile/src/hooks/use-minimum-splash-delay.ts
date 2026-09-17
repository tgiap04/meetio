import { useEffect, useState } from 'react';

/**
 * The third of the splash gate's three conditions (decisions.md §1). Starts
 * `false` and flips to `true` once `ms` has elapsed — a floor, not padding:
 * because the gate runs this in parallel (`max(...)`) with session and
 * preferences hydration, a slow hydrate never waits an extra `ms` on top.
 * Its only job is to stop a fast hydrate (~40ms) from reading as a flicker.
 */
export function useMinimumSplashDelay(ms: number): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);

  return elapsed;
}
