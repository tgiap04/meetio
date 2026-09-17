import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import { User, Meeting } from '../database/entities/index.js';

const HARD_DELETE_GRACE_DAYS = 30;
const RETENTION_WARNING_DAYS_AHEAD = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Business logic for the two account-lifecycle jobs described in
 * phase-03-auth-and-account.md step 7. Kept as a plain injectable (no
 * BullMQ types here) so it is unit-testable with mocked repositories; the
 * BullMQ scheduling wrapper lives in `account-maintenance.processor.ts`.
 */
@Injectable()
export class AccountMaintenanceService {
  private readonly logger = new Logger(AccountMaintenanceService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
  ) {}

  /**
   * Hard-deletes any account soft-deleted more than 30 days ago. This is a
   * genuine `DELETE` on the `users` row — every FK from `meetings`,
   * `refresh_tokens`, etc. is `ON DELETE CASCADE`, so the whole account's
   * data trail goes with it (legal deletion right, NĐ 13/2023 — this is not
   * optional cosmetic cleanup).
   */
  async hardDeleteExpiredAccounts(): Promise<number> {
    const cutoff = new Date(Date.now() - HARD_DELETE_GRACE_DAYS * DAY_MS);
    const expired = await this.users.find({ where: { deleted_at: LessThanOrEqual(cutoff) } });
    if (expired.length === 0) {
      return 0;
    }
    await this.users.delete(expired.map((u) => u.id));
    this.logger.log(`Hard-deleted ${expired.length} account(s) past their 30-day grace period`);
    return expired.length;
  }

  /**
   * Deletes meetings past a user's `retention_days`, and separately warns
   * (logs today — no notification channel exists yet, tracked as a
   * follow-up for the notifications phase) about meetings that will expire
   * within the next 7 days. `retention_days IS NULL` means keep forever.
   */
  async applyRetentionPolicy(): Promise<{ deleted: number; warned: number }> {
    const usersWithRetention = await this.users.find({
      where: { retention_days: Not(IsNull()), deleted_at: IsNull() },
    });

    let deleted = 0;
    let warned = 0;
    for (const user of usersWithRetention) {
      if (user.retention_days === null) continue;
      const expiryCutoff = new Date(Date.now() - user.retention_days * DAY_MS);
      const warningCutoff = new Date(Date.now() - (user.retention_days - RETENTION_WARNING_DAYS_AHEAD) * DAY_MS);

      const expiredMeetings = await this.meetings.find({
        where: { user_id: user.id, created_at: LessThanOrEqual(expiryCutoff), deleted_at: IsNull() },
      });
      if (expiredMeetings.length > 0) {
        // `deleted_at` is a plain column (not `@DeleteDateColumn`) on `Meeting`,
        // so this is an explicit update rather than TypeORM's softDelete API.
        await this.meetings.update(
          expiredMeetings.map((m) => m.id),
          { deleted_at: new Date() },
        );
        deleted += expiredMeetings.length;
      }

      const aboutToExpire = await this.meetings.find({
        where: { user_id: user.id, created_at: LessThanOrEqual(warningCutoff), deleted_at: IsNull() },
      });
      if (aboutToExpire.length > 0) {
        this.logger.warn(
          `User ${user.id} has ${aboutToExpire.length} meeting(s) expiring within ${RETENTION_WARNING_DAYS_AHEAD} days under retention_days=${user.retention_days}`,
        );
        warned += aboutToExpire.length;
      }
    }
    return { deleted, warned };
  }
}
