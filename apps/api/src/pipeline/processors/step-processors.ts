import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { ProcessingStep } from '@meetio/shared';
import { PipelineEngine } from '../pipeline-engine.js';
import { stepWorkerOptions } from '../pipeline-options.js';
import { STEP_ATTEMPTS, stepQueueName, type StepJobData } from '../pipeline-steps.js';

/** Shared body; the five subclasses exist only because @Processor binds one class to one queue. */
abstract class StepProcessor extends WorkerHost {
  constructor(private readonly engine: PipelineEngine) {
    super();
  }

  process(job: Job<StepJobData>): Promise<void> {
    return this.engine.handleStepJob(job.data, job.attemptsMade, job.opts.attempts ?? STEP_ATTEMPTS);
  }
}

@Processor(stepQueueName(ProcessingStep.CHUNK), stepWorkerOptions)
export class ChunkStepProcessor extends StepProcessor {
  constructor(engine: PipelineEngine) {
    super(engine);
  }
}

@Processor(stepQueueName(ProcessingStep.EMBED), stepWorkerOptions)
export class EmbedStepProcessor extends StepProcessor {
  constructor(engine: PipelineEngine) {
    super(engine);
  }
}

@Processor(stepQueueName(ProcessingStep.EXTRACT), stepWorkerOptions)
export class ExtractStepProcessor extends StepProcessor {
  constructor(engine: PipelineEngine) {
    super(engine);
  }
}

@Processor(stepQueueName(ProcessingStep.RESOLVE), stepWorkerOptions)
export class ResolveStepProcessor extends StepProcessor {
  constructor(engine: PipelineEngine) {
    super(engine);
  }
}

@Processor(stepQueueName(ProcessingStep.SUMMARIZE), stepWorkerOptions)
export class SummarizeStepProcessor extends StepProcessor {
  constructor(engine: PipelineEngine) {
    super(engine);
  }
}

export const STEP_PROCESSORS = [
  ChunkStepProcessor,
  EmbedStepProcessor,
  ExtractStepProcessor,
  ResolveStepProcessor,
  SummarizeStepProcessor,
];
