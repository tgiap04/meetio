import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Counts requests per authenticated user rather than per IP — api-spec §10
 * states `/search` and Q&A limits "per user", and many users can share one
 * office NAT address. The global JwtAuthGuard runs first, so `req.user` is set.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { userId?: string } | undefined;
    return user?.userId ? `user:${user.userId}` : `ip:${String(req.ip)}`;
  }
}
