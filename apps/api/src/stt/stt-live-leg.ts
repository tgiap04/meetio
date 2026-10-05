import type { SttStreamErrorCode } from '@meetio/shared';
import type { LiveSession } from '../ai/gemini-live.js';

export interface SttLiveOptions {
  /** A Live session is replaced this long after it opened (Gemini ends one at 10 minutes). */
  rotateAfterMs: number;
  /** Rotation starts this much earlier, as soon as the speaker pauses; at rotateAfterMs it starts regardless. */
  quietWindowMs: number;
  /** Audio replayed into the new session so no word falls between the two. */
  overlapMs: number;
  /** How long to wait for Gemini to settle its last words when a session ends. */
  flushMs: number;
  /** Size of the in-RAM ring buffer of recent audio. */
  ringMs: number;
}

export interface SttLiveSink {
  partial(text: string): void;
  final(text: string): void;
  /** The stream cannot continue. After this the session is closed and emits nothing more. */
  fatal(code: SttStreamErrorCode, message: string): void;
}

export interface Leg {
  session: LiveSession;
  openedAt: number;
  closed: boolean;
  /** The latest partial not yet settled by a final. */
  pending: string;
  /** Events of a session that is not yet allowed to speak (a rotation in progress). */
  held: Array<['partial' | 'final', string]> | null;
  onSettled: (() => void) | null;
}

/** 16 kHz mono PCM16. */
export const BYTES_PER_MS = 32;
export const QUIET_MS = 1000;
export const POLL_MS = 250;
/** Two unexpected drops closer together than this end the stream instead of looping. */
export const RECOVER_MIN_GAP_MS = 5000;
export const SEAM_WORDS = 24;
/** Placeholder until the opener resolves; a leg only becomes reachable after that. */
export const UNOPENED: LiveSession = { sendAudio: () => undefined, endAudio: () => undefined, close: () => undefined };


export const errorName = (error: unknown) => (error instanceof Error ? error.name : 'Error');

/** Tells Gemini the audio ended; a socket that is already gone counts as closed. */
export function endAudio(leg: Leg): void {
  try {
    leg.session.endAudio();
  } catch {
    leg.closed = true;
  }
}

/** Resolves when the leg has settled its last words, closed, or `flushMs` passed. */
export function awaitSettled(leg: Leg, flushMs: number): Promise<void> {
  if (leg.closed || !leg.pending) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      leg.onSettled = null;
      resolve();
    };
    const timeout = setTimeout(done, flushMs);
    leg.onSettled = done;
  });
}

export function closeLeg(leg: Leg): void {
  if (leg.closed) return;
  leg.closed = true;
  try {
    leg.session.close();
  } catch {
    // already closed
  }
}
