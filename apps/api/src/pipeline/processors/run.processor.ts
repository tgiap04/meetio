import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PipelineEngine } from '../pipeline-engine.js';
import { RUN_QUEUE, type RunJobData } from '../pipeline-steps.js';
import { STEP_CONCURRENCY } from '../pipeline-options.js';

/** Consumes the `meeting-processing` job that `end`, the 24h sweep and `reindex` enqueue. */
@Processor(RUN_QUEUE, { concurrency: STEP_CONCURRENCY })
export class RunProcessor extends WorkerHost {
  constructor(private readonly engine: PipelineEngine) {
    super();
  }

  process(job: Job<RunJobData>): Promise<void> {
    return this.engine.handleRunJob(job.data);
  }
}
