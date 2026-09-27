import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { elapsedMs, useRecordingStore } from '../recording/recording.store';

/** `HH:MM:SS` from a millisecond duration. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Recorded time of the live session, ticking once a second; frozen while paused (US-09). */
export function useElapsedClock(now: () => number = Date.now): string {
  const timing = useRecordingStore(useShallow((s) => ({ startedAt: s.startedAt, pausedMs: s.pausedMs, pausedAt: s.pausedAt })));
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return formatElapsed(elapsedMs(timing, now()));
}
