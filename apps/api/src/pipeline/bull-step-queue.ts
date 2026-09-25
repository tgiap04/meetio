import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ProcessingStep } from '@meetio/shared';
import type { StepQueuePort } from './pipeline-engine.js';
import { STEP_ATTEMPTS, stepJobId, stepQueueName, type StepJobData } from './pipeline-steps.js';

/** One BullMQ queue per step (phase-11 "Kiến trúc"), so each step retries and scales on its own. */
@Injectable()
export class BullStepQueue implements StepQueuePort {
  private readonly queues: Record<ProcessingStep, Queue<StepJobData>>;

  constructor(
    @InjectQueue(stepQueueName(ProcessingStep.CHUNK)) chunk: Queue<StepJobData>,
    @InjectQueue(stepQueueName(ProcessingStep.EMBED)) embed: Queue<StepJobData>,
    @InjectQueue(stepQueueName(ProcessingStep.EXTRACT)) extract: Queue<StepJobData>,
    @InjectQueue(stepQueueName(ProcessingStep.RESOLVE)) resolve: Queue<StepJobData>,
    @InjectQueue(stepQueueName(ProcessingStep.SUMMARIZE)) summarize: Queue<StepJobData>,
  ) {
    this.queues = { chunk, embed, extract, resolve, summarize };
  }

  async enqueue(data: StepJobData): Promise<void> {
    await this.queues[data.step].add(data.step, data, {
      jobId: stepJobId(data.meeting_id, data.run, data.step),
      attempts: STEP_ATTEMPTS,
      backoff: { type: 'custom' },
      // processing_jobs is the durable record; finished jobs free their id so a
      // resume sweep can schedule the same step again if it ever needs to.
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}
