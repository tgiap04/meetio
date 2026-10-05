import type { SqlDb } from '../queue/queue-db';
import { upsertTranslation } from '../queue/translation-queue';
import { setLiveTranslation } from './recording.store';

/** One ML Kit call that never settles must not hold up the lines behind it, nor ending the meeting. */
export const TRANSLATE_TIMEOUT_MS = 30_000;

/** Translates `text` entirely on the device (ML Kit); rejects when a language pack is missing. */
export type TranslateText = (text: string, from: string, to: string) => Promise<string>;

export interface TranslationRunnerDeps {
  translate: TranslateText;
  db: () => Promise<SqlDb>;
  /** Nudged after a translation is saved so the sync worker sends it. */
  worker: { kick(): void };
}

/**
 * Translates the lines of the meeting on screen, one at a time (a phone translates a sentence in a
 * fraction of a second, and one at a time keeps memory and the native side calm). Each result is
 * shown in the store at once and saved to the on-disk queue for the sync worker. A failure only marks
 * that line — it never blocks the lines after it, nor ending the meeting.
 */
export function createTranslationRunner(deps: TranslationRunnerDeps) {
  let chain: Promise<void> = Promise.resolve();

  function translateLine(meetingId: string, seq: number, text: string, from: string, to: string): Promise<void> {
    setLiveTranslation(meetingId, seq, { status: 'pending' });
    const job = chain.then(async () => {
      try {
        const translated = (await withTimeout(deps.translate(text, from, to), TRANSLATE_TIMEOUT_MS)).trim();
        if (!translated) throw new Error('Empty translation');
        // Saved before it is shown as done: what the screen calls translated can survive a crash.
        await upsertTranslation(await deps.db(), meetingId, seq, translated, to);
        setLiveTranslation(meetingId, seq, { status: 'done', text: translated, to });
        deps.worker.kick();
      } catch {
        setLiveTranslation(meetingId, seq, { status: 'failed' });
      }
    });
    chain = job;
    return job;
  }

  return {
    translateLine,
    /** Resolves once every line queued so far is translated or failed. Never rejects, never times out. */
    settled: () => chain,
  };
}

export type TranslationRunner = ReturnType<typeof createTranslationRunner>;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Translation timed out')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
