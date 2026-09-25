import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

export const MEETING_PROCESSING_QUEUE = 'meeting-processing';
export const PROCESS_MEETING_JOB = 'process-meeting';

export interface ProcessMeetingJobData {
  meeting_id: string;
}

/**
 * Hands an `ended → queued` meeting to the AI pipeline. The job waits in Redis
 * until Phase 11 attaches the processor — this is the real hand-off, not a stub.
 *
 * `jobId = meeting_id` makes enqueueing idempotent: calling it again for a
 * meeting whose job is still stored is a no-op, which is what lets the
 * maintenance sweep re-enqueue every `queued` meeting without double-processing.
 */
@Injectable()
export class MeetingPipelineTrigger {
  private readonly logger = new Logger(MeetingPipelineTrigger.name);

  constructor(@InjectQueue(MEETING_PROCESSING_QUEUE) private readonly queue: Queue<ProcessMeetingJobData>) {}

  async enqueue(meetingId: string): Promise<void> {
    await this.queue.add(PROCESS_MEETING_JOB, { meeting_id: meetingId }, { jobId: meetingId });
  }

  /**
   * For callers whose status change has already committed: a Redis hiccup must
   * not turn a durable `queued` into an HTTP error, because retrying `end` would
   * then fail with 409. The maintenance sweep re-enqueues stranded meetings.
   */
  async enqueueAfterCommit(meetingId: string): Promise<void> {
    try {
      await this.enqueue(meetingId);
    } catch (error) {
      this.logger.error(
        `Enqueue failed for meeting ${meetingId}; the maintenance sweep will retry`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
