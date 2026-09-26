import { cooldownFor, GeminiKeyPool, nextPacificMidnight, parseApiKeys } from './gemini-key-pool.js';

describe('Gemini key pool', () => {
  it('parses a comma-separated list, trimming blanks and duplicates', () => {
    expect(parseApiKeys(' k1, k2 ,,k1,k3 ')).toEqual(['k1', 'k2', 'k3']);
    expect(parseApiKeys(undefined)).toEqual([]);
    expect(parseApiKeys('solo')).toEqual(['solo']);
  });

  it('hands out keys in turn (round-robin)', () => {
    const pool = new GeminiKeyPool(['a', 'b', 'c'], { defaultCooldownMs: 60_000 });
    expect([1, 2, 3, 4].map(() => pool.acquire()!.client)).toEqual(['a', 'b', 'c', 'a']);
  });

  it('skips a resting key until its rest is over', () => {
    let now = 0;
    const pool = new GeminiKeyPool(['a', 'b'], { defaultCooldownMs: 60_000, now: () => now });
    const a = pool.acquire()!;
    pool.rest(a, new Error('429 Too Many Requests'));
    expect([1, 2, 3].map(() => pool.acquire()!.client)).toEqual(['b', 'b', 'b']);
    now = 60_001;
    expect([pool.acquire()!.client, pool.acquire()!.client].sort()).toEqual(['a', 'b']);
  });

  it('reports no key when all rest, and when the soonest one returns', () => {
    let now = 0;
    const pool = new GeminiKeyPool(['a'], { defaultCooldownMs: 30_000, now: () => now });
    pool.rest(pool.acquire()!, new Error('429'));
    expect(pool.acquire()).toBeNull();
    now = 10_000;
    expect(pool.soonestAvailableInMs()).toBe(20_000);
  });

  it('never hands out a disabled key again', () => {
    const pool = new GeminiKeyPool(['bad', 'good'], { defaultCooldownMs: 1 });
    pool.disable(pool.acquire()!);
    expect([1, 2, 3].map(() => pool.acquire()!.client)).toEqual(['good', 'good', 'good']);
    pool.disable(pool.acquire()!);
    expect(pool.acquire()).toBeNull();
    expect(pool.soonestAvailableInMs()).toBeNull();
  });

  it("honours Gemini's retryDelay, and rests until the next Pacific day for a daily quota", () => {
    const now = Date.UTC(2026, 8, 26, 3, 0, 0); // 20:00 PDT on 25/09
    expect(cooldownFor(new Error('{"error":{"details":[{"retryDelay":"37s"}]}}'), 60_000, now)).toBe(37_000);
    expect(cooldownFor(new Error('quota exceeded'), 60_000, now)).toBe(60_000);
    const daily = cooldownFor(new Error('GenerateRequestsPerDayPerProjectPerModel exceeded'), 60_000, now);
    expect(daily).toBe(4 * 60 * 60 * 1000); // until 00:00 PDT
    expect(nextPacificMidnight(now)).toBe(Date.UTC(2026, 8, 26, 7, 0, 0));
  });
});
