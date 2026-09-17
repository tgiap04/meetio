import { jest } from '@jest/globals';

/** In-memory stand-in for the handful of ioredis calls `RedisThrottlerStorage`
 * makes, so the test exercises real increment/expire/block semantics without
 * a live Redis. */
class FakeRedis {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  private isLive(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async incr(key: string): Promise<number> {
    const current = this.isLive(key) ? Number(this.store.get(key)!.value) : 0;
    const next = current + 1;
    this.store.set(key, { value: String(next), expiresAt: this.isLive(key) ? this.store.get(key)!.expiresAt : null });
    return next;
  }

  async pexpire(key: string, ms: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) entry.expiresAt = Date.now() + ms;
  }

  async pttl(key: string): Promise<number> {
    if (!this.isLive(key)) return -2;
    return this.store.get(key)!.expiresAt! - Date.now();
  }

  async set(key: string, value: string, _px: 'PX', ms: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ms });
  }

  async quit(): Promise<void> {}
}

jest.unstable_mockModule('ioredis', () => ({ Redis: FakeRedis }));

const { RedisThrottlerStorage } = await import('./redis-throttler.storage.js');

describe('RedisThrottlerStorage', () => {
  it('allows requests under the limit', async () => {
    const storage = new RedisThrottlerStorage('redis://fake');
    const r1 = await storage.increment('1.2.3.4', 60_000, 10, 0, 'default');
    expect(r1.totalHits).toBe(1);
    expect(r1.isBlocked).toBe(false);
  });

  it('blocks the request that crosses the limit — the 11th call in a 10/min window', async () => {
    const storage = new RedisThrottlerStorage('redis://fake');
    let last;
    for (let i = 0; i < 11; i += 1) {
      last = await storage.increment('1.2.3.4', 60_000, 10, 0, 'auth');
    }
    expect(last!.totalHits).toBe(11);
    expect(last!.isBlocked).toBe(true);
  });

  it('keeps returning isBlocked once a block window is set, even for a fresh counter window', async () => {
    const storage = new RedisThrottlerStorage('redis://fake');
    for (let i = 0; i < 11; i += 1) {
      await storage.increment('9.9.9.9', 60_000, 10, 30_000, 'auth');
    }
    const blocked = await storage.increment('9.9.9.9', 60_000, 10, 30_000, 'auth');
    expect(blocked.isBlocked).toBe(true);
  });

  it('tracks separate keys independently', async () => {
    const storage = new RedisThrottlerStorage('redis://fake');
    await storage.increment('ip-a', 60_000, 10, 0, 'auth');
    const ipB = await storage.increment('ip-b', 60_000, 10, 0, 'auth');
    expect(ipB.totalHits).toBe(1);
  });
});
