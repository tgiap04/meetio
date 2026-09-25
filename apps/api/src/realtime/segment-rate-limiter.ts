import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisThrottlerStorage } from '../common/throttler/redis-throttler.storage.js';

const WINDOW_MS = 60_000;
const LIMIT_PER_MEETING = 120;

/**
 * api-spec §10: `transcript_segment` is capped at 120 events / minute / meeting.
 * Counted in Redis (the same storage as the HTTP throttler) so the cap holds
 * across API processes. A 10-minute offline backlog belongs on
 * `POST /meetings/:id/segments/bulk`, not on this channel.
 */
@Injectable()
export class SegmentRateLimiter implements OnModuleDestroy {
  private readonly storage: RedisThrottlerStorage;

  constructor(config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for WebSocket rate limiting');
    }
    this.storage = new RedisThrottlerStorage(redisUrl);
  }

  async allow(meetingId: string): Promise<boolean> {
    const record = await this.storage.increment(meetingId, WINDOW_MS, LIMIT_PER_MEETING, 0, 'ws-segment');
    return !record.isBlocked;
  }

  async onModuleDestroy(): Promise<void> {
    await this.storage.onModuleDestroy();
  }
}
