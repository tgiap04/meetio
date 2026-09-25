import * as SecureStore from 'expo-secure-store';

/**
 * Per-meeting "last read segment" position (US-23's jump-to-last-read-position).
 * Keyed by meeting id so switching between meetings' transcripts doesn't clobber
 * each other's position. Uses the same `expo-secure-store` dependency as
 * `secure-store.ts` for the reason that file documents: it's already present
 * with a Jest mock, and the value isn't sensitive.
 */
function keyFor(meetingId: string): string {
  return `meetio.transcript_last_read_seq.${meetingId}`;
}

/** Fails open to `null` on any read error — worst case, "jump to last read"
 *  falls back to the top of the transcript instead of crashing the screen. */
export async function readLastReadSeq(meetingId: string): Promise<number | null> {
  try {
    const value = await SecureStore.getItemAsync(keyFor(meetingId));
    if (value === null) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeLastReadSeq(meetingId: string, seq: number): Promise<void> {
  await SecureStore.setItemAsync(keyFor(meetingId), String(seq));
}
