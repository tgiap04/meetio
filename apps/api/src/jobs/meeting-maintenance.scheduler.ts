import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { CLOSE_ABANDONED_JOB_NAME, MEETING_MAINTENANCE_QUEUE, REQUEUE_STRANDED_JOB_NAME } from './meeting-maintenance.processor.js';

const EVERY_15_MINUTES = 15 * 60 * 1000;

/** Registers the meeting sweeps once on boot; `upsertJobScheduler` is idempotent by id. */
@Injectable()
export class MeetingMaintenanceScheduler implements OnModuleInit {
  private readonly logger = new Logger(MeetingMaintenanceScheduler.name);

  constructor(@InjectQueue(MEETING_MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(CLOSE_ABANDONED_JOB_NAME, { every: EVERY_15_MINUTES }, { name: CLOSE_ABANDONED_JOB_NAME });
    await this.queue.upsertJobScheduler(REQUEUE_STRANDED_JOB_NAME, { every: EVERY_15_MINUTES }, { name: REQUEUE_STRANDED_JOB_NAME });
    this.logger.log('Registered meeting-maintenance sweeps (every 15 min)');
  }
}
