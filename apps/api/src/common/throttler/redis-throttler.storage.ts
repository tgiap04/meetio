import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';

/** Mirrors `@nestjs/throttler`'s `ThrottlerStorageRecord`, which the package
 * does not re-export from its public entry point. */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * `ThrottlerStorage` backed by Redis (api-spec §10) instead of the
 * package's in-memory default, so the 10/min/IP limit on `/auth/*` holds
 * across every API process, not per-instance. Uses `ioredis`, already a
 * project dependency (no new package).
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const counterKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${counterKey}:blocked`;

    const blockedPttl = await this.client.pttl(blockKey);
    if (blockedPttl > 0) {
      return { totalHits: limit + 1, timeToExpire: 0, isBlocked: true, timeToBlockExpire: Math.ceil(blockedPttl / 1000) };
    }

    const totalHits = await this.client.incr(counterKey);
    if (totalHits === 1) {
      await this.client.pexpire(counterKey, ttl);
    }
    const counterPttl = await this.client.pttl(counterKey);
    const timeToExpire = Math.ceil(Math.max(counterPttl, 0) / 1000);

    if (totalHits <= limit) {
      return { totalHits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
    }

    const effectiveBlockMs = blockDuration > 0 ? blockDuration : Math.max(counterPttl, 0);
    if (effectiveBlockMs > 0) {
      await this.client.set(blockKey, '1', 'PX', effectiveBlockMs);
    }
    return { totalHits, timeToExpire, isBlocked: true, timeToBlockExpire: Math.ceil(effectiveBlockMs / 1000) };
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
