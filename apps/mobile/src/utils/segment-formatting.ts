/** `mm:ss` from a millisecond offset into the meeting. */
export function formatSegmentTimestamp(startedAtMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(startedAtMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** The gap-marker label shown above a segment when recognition was interrupted — nothing was
 *  heard in that time, it is not silence (US-10/US-23 — the gap is always shown, never hidden).
 *  Same wording as the exported transcript. */
export function formatGapLabel(gapBeforeMs: number): string {
  const seconds = Math.max(1, Math.round(gapBeforeMs / 1000));
  return `— Gián đoạn ${seconds} giây —`;
}
