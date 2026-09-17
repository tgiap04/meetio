import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ACCOUNT_MAINTENANCE_QUEUE, HARD_DELETE_JOB_NAME, RETENTION_JOB_NAME } from './account-maintenance.processor.js';

const DAILY_AT_3AM_CRON = '0 3 * * *';

/** Registers the two repeatable BullMQ jobs once, on boot. BullMQ dedupes
 * repeatable jobs by their `jobId` + pattern, so calling this on every
 * process start is idempotent — it will not pile up duplicate schedules. */
@Injectable()
export class AccountMaintenanceScheduler implements OnModuleInit {
  private readonly logger = new Logger(AccountMaintenanceScheduler.name);

  constructor(@InjectQueue(ACCOUNT_MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // `upsertJobScheduler` (BullMQ's repeat API) is idempotent by scheduler
    // id — safe to call on every process boot without piling up duplicates.
    await this.queue.upsertJobScheduler(HARD_DELETE_JOB_NAME, { pattern: DAILY_AT_3AM_CRON }, { name: HARD_DELETE_JOB_NAME });
    await this.queue.upsertJobScheduler(RETENTION_JOB_NAME, { pattern: DAILY_AT_3AM_CRON }, { name: RETENTION_JOB_NAME });
    this.logger.log('Registered daily account-maintenance jobs (hard-delete, retention)');
  }
}
