import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MeetingMaintenanceService } from './abandoned-meeting.job.js';

export const MEETING_MAINTENANCE_QUEUE = 'meeting-maintenance';
export const CLOSE_ABANDONED_JOB_NAME = 'close-abandoned-meetings';
export const REQUEUE_STRANDED_JOB_NAME = 'requeue-stranded-meetings';

@Processor(MEETING_MAINTENANCE_QUEUE)
export class MeetingMaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingMaintenanceProcessor.name);

  constructor(private readonly maintenance: MeetingMaintenanceService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case CLOSE_ABANDONED_JOB_NAME:
        return this.maintenance.closeAbandonedMeetings();
      case REQUEUE_STRANDED_JOB_NAME:
        return this.maintenance.requeueStrandedMeetings();
      default:
        this.logger.warn(`Unknown meeting-maintenance job: ${job.name}`);
        return undefined;
    }
  }
}
