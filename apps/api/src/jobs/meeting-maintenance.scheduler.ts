import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  CLOSE_ABANDONED_JOB_NAME,
  MEETING_MAINTENANCE_QUEUE,
  REQUEUE_STRANDED_JOB_NAME,
  RESUME_STALLED_JOB_NAME,
  APPLY_RETENTION_JOB_NAME,
} from './meeting-maintenance.processor.js';

const EVERY_15_MINUTES = 15 * 60 * 1000;
// A crashed step should not leave a meeting spinning for long: resume runs more often.
const EVERY_5_MINUTES = 5 * 60 * 1000;
// Retention works in days; hourly keeps the 7-day notice and the deletion close to their dates.
const EVERY_HOUR = 60 * 60 * 1000;

/** Registers the meeting sweeps once on boot; `upsertJobScheduler` is idempotent by id. */
@Injectable()
export class MeetingMaintenanceScheduler implements OnModuleInit {
  private readonly logger = new Logger(MeetingMaintenanceScheduler.name);

  constructor(@InjectQueue(MEETING_MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(CLOSE_ABANDONED_JOB_NAME, { every: EVERY_15_MINUTES }, { name: CLOSE_ABANDONED_JOB_NAME });
    await this.queue.upsertJobScheduler(REQUEUE_STRANDED_JOB_NAME, { every: EVERY_15_MINUTES }, { name: REQUEUE_STRANDED_JOB_NAME });
    await this.queue.upsertJobScheduler(RESUME_STALLED_JOB_NAME, { every: EVERY_5_MINUTES }, { name: RESUME_STALLED_JOB_NAME });
    await this.queue.upsertJobScheduler(APPLY_RETENTION_JOB_NAME, { every: EVERY_HOUR }, { name: APPLY_RETENTION_JOB_NAME });
    this.logger.log('Registered meeting-maintenance sweeps (15 min; pipeline resume 5 min; retention hourly)');
  }
}
