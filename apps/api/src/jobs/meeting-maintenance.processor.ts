import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MeetingMaintenanceService } from './abandoned-meeting.job.js';
import { PipelineEngine } from '../pipeline/pipeline-engine.js';

export const MEETING_MAINTENANCE_QUEUE = 'meeting-maintenance';
export const CLOSE_ABANDONED_JOB_NAME = 'close-abandoned-meetings';
export const REQUEUE_STRANDED_JOB_NAME = 'requeue-stranded-meetings';
export const RESUME_STALLED_JOB_NAME = 'resume-stalled-pipelines';

// A run untouched this long is paused at a missing handler or lost its step job.
const STALLED_AFTER_MS = 5 * 60 * 1000;

@Processor(MEETING_MAINTENANCE_QUEUE)
export class MeetingMaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingMaintenanceProcessor.name);

  constructor(
    private readonly maintenance: MeetingMaintenanceService,
    private readonly pipeline: PipelineEngine,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case CLOSE_ABANDONED_JOB_NAME:
        return this.maintenance.closeAbandonedMeetings();
      case REQUEUE_STRANDED_JOB_NAME:
        return this.maintenance.requeueStrandedMeetings();
      case RESUME_STALLED_JOB_NAME:
        return this.pipeline.resumeStalled(new Date(Date.now() - STALLED_AFTER_MS));
      default:
        this.logger.warn(`Unknown meeting-maintenance job: ${job.name}`);
        return undefined;
    }
  }
}
