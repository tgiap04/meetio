/**
 * Several Gemini API keys, used in turn (clarifications 2026-09-26).
 * `GEMINI_API_KEY=k1,k2,k3`: each call takes the next key that is not resting;
 * a key answered with 429 rests for Gemini's own `retryDelay` (default 60s),
 * or until the next Pacific-time day when the error says a *daily* quota is
 * spent; a key Gemini rejects as invalid is dropped for the process lifetime.
 *
 * Keys never reach a log or the database — only their 1-based position does.
 * Quotas are per Google Cloud project, so keys only add headroom when they
 * belong to different projects.
 */
export interface KeySlot<T> {
  index: number;
  client: T;
}

export interface KeyPoolOptions {
  defaultCooldownMs: number;
  now?: () => number;
}

interface Entry<T> {
  client: T;
  restingUntil: number;
  disabled: boolean;
}

export function parseApiKeys(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(',').map((k) => k.trim()).filter(Boolean))];
}

/** Next midnight in America/Los_Angeles, when Gemini's per-day quotas reset. */
export function nextPacificMidnight(nowMs: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(nowMs))
      .map((p) => [p.type, Number(p.value)]),
  );
  const elapsedToday = (((parts.hour % 24) * 60 + parts.minute) * 60 + parts.second) * 1000;
  return nowMs - elapsedToday - (nowMs % 1000) + 24 * 60 * 60 * 1000;
}

/** How long a key should rest after a 429, from Gemini's error body. */
export function cooldownFor(error: unknown, defaultMs: number, nowMs: number): number {
  const text = error instanceof Error ? error.message : String(error);
  if (/PerDay/i.test(text)) return Math.max(defaultMs, nextPacificMidnight(nowMs) - nowMs);
  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text);
  return delay ? Math.max(1000, Math.ceil(Number(delay[1]) * 1000)) : defaultMs;
}

export class GeminiKeyPool<T> {
  private readonly entries: Entry<T>[];
  private cursor = 0;
  private readonly now: () => number;

  constructor(clients: T[], private readonly options: KeyPoolOptions) {
    if (clients.length === 0) throw new Error('GeminiKeyPool needs at least one key');
    this.entries = clients.map((client) => ({ client, restingUntil: 0, disabled: false }));
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.length;
  }

  /** The next usable key in turn, or null when every key is resting or disabled. */
  acquire(): KeySlot<T> | null {
    const now = this.now();
    for (let tried = 0; tried < this.entries.length; tried++) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.entries.length;
      const entry = this.entries[index];
      if (!entry.disabled && entry.restingUntil <= now) return { index: index + 1, client: entry.client };
    }
    return null;
  }

  rest(slot: KeySlot<T>, error: unknown): number {
    const ms = cooldownFor(error, this.options.defaultCooldownMs, this.now());
    this.entries[slot.index - 1].restingUntil = this.now() + ms;
    return ms;
  }

  disable(slot: KeySlot<T>): void {
    this.entries[slot.index - 1].disabled = true;
  }

  /** When the soonest resting key comes back — for a meaningful "retry after" message. */
  soonestAvailableInMs(): number | null {
    const live = this.entries.filter((e) => !e.disabled);
    if (live.length === 0) return null;
    return Math.max(0, Math.min(...live.map((e) => e.restingUntil)) - this.now());
  }
}
