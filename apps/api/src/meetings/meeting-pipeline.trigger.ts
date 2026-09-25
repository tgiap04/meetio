import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { RUN_QUEUE, runJobId, type RunJobData } from '../pipeline/pipeline-steps.js';

export const MEETING_PROCESSING_QUEUE = RUN_QUEUE;
export const PROCESS_MEETING_JOB = 'process-meeting';
export type ProcessMeetingJobData = RunJobData;

/**
 * Hands a `queued` meeting's current run to the pipeline (Phase 11 processes it).
 *
 * Job id `<meeting>-r<run>`: enqueueing the same run twice is a no-op while the
 * job is waiting or active, and a retry or re-run (a new run number) is a new
 * job instead of being swallowed by BullMQ's id dedupe. Finished jobs are
 * removed — `processing_jobs` and the meeting row hold the durable state.
 */
@Injectable()
export class MeetingPipelineTrigger {
  private readonly logger = new Logger(MeetingPipelineTrigger.name);

  constructor(@InjectQueue(MEETING_PROCESSING_QUEUE) private readonly queue: Queue<RunJobData>) {}

  async enqueue(meetingId: string, run: number): Promise<void> {
    await this.queue.add(
      PROCESS_MEETING_JOB,
      { meeting_id: meetingId, run },
      { jobId: runJobId(meetingId, run), removeOnComplete: true, removeOnFail: true },
    );
  }

  /**
   * For callers whose status change has already committed: a Redis hiccup must
   * not turn a durable `queued` into an HTTP error, because retrying the request
   * would then fail with 409. The maintenance sweep re-enqueues stranded meetings.
   */
  async enqueueAfterCommit(meetingId: string, run: number): Promise<void> {
    try {
      await this.enqueue(meetingId, run);
    } catch (error) {
      this.logger.error(
        `Enqueue failed for meeting ${meetingId} run ${run}; the maintenance sweep will retry`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
