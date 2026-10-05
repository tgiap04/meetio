import type { TranslationTarget } from './translation-store.js';

/**
 * A meeting's translation settings, trusted for `ttlMs` so ingesting a segment costs no DB read
 * (also when translation is off — the common case). Held as a promise: segments arriving together
 * share one read; a failed read is not remembered. `forget` ends the trust early (PATCH of translate_to).
 */
export class TranslationSettingsCache {
  private readonly entries = new Map<string, { target: Promise<TranslationTarget | null>; expiresAt: number }>();

  constructor(
    private readonly load: (meetingId: string) => Promise<TranslationTarget | null>,
    private readonly ttlMs: number,
  ) {}

  get(meetingId: string): Promise<TranslationTarget | null> {
    const cached = this.entries.get(meetingId);
    if (cached && cached.expiresAt > Date.now()) return cached.target;
    const target = this.load(meetingId);
    const entry = { target, expiresAt: Date.now() + this.ttlMs };
    this.entries.set(meetingId, entry);
    target.catch(() => {
      if (this.entries.get(meetingId) === entry) this.entries.delete(meetingId);
    });
    return target;
  }

  forget(meetingId: string): void {
    this.entries.delete(meetingId);
  }
}
