import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AccountMaintenanceService } from './account-deletion.job.js';

export const ACCOUNT_MAINTENANCE_QUEUE = 'account-maintenance';
export const HARD_DELETE_JOB_NAME = 'hard-delete-expired-accounts';
export const RETENTION_JOB_NAME = 'apply-retention-policy';

/** Runs the two account-lifecycle jobs (`AccountMaintenanceService`) off a
 * BullMQ queue backed by Redis, so a job survives an API process restart. */
@Processor(ACCOUNT_MAINTENANCE_QUEUE)
export class AccountMaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountMaintenanceProcessor.name);

  constructor(private readonly accountMaintenance: AccountMaintenanceService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case HARD_DELETE_JOB_NAME:
        return this.accountMaintenance.hardDeleteExpiredAccounts();
      case RETENTION_JOB_NAME:
        return this.accountMaintenance.applyRetentionPolicy();
      default:
        this.logger.warn(`Unknown account-maintenance job: ${job.name}`);
        return undefined;
    }
  }
}
