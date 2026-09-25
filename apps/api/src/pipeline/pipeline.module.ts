import { Logger, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PipelineStepRegistry } from './pipeline-step-handler.js';
import { PipelineStore } from './pipeline-store.js';
import { PipelineEngine } from './pipeline-engine.js';
import { BullStepQueue } from './bull-step-queue.js';
import { PipelineEventsAdapter } from './pipeline-events.adapter.js';
import { PipelineControlService } from './pipeline-control.service.js';
import { PipelineController } from './pipeline.controller.js';
import { RunProcessor } from './processors/run.processor.js';
import { STEP_PROCESSORS } from './processors/step-processors.js';
import { STEP_ORDER, RUN_QUEUE, stepQueueName } from './pipeline-steps.js';
import { STEP_TIMEOUT_MS } from './pipeline-options.js';

/**
 * Phase 11 — the rails the AI steps run on. Phases 12–14 register a
 * `PipelineStepHandler` per step with `PipelineStepRegistry`; until then the
 * pipeline pauses at the first unimplemented step.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: RUN_QUEUE }, ...STEP_ORDER.map((step) => ({ name: stepQueueName(step) }))),
    MeetingsModule,
    RealtimeModule,
    NotificationsModule,
  ],
  controllers: [PipelineController],
  providers: [
    { provide: PipelineStepRegistry, useValue: new PipelineStepRegistry() },
    { provide: PipelineStore, inject: [DataSource], useFactory: (ds: DataSource) => new PipelineStore(ds) },
    BullStepQueue,
    PipelineEventsAdapter,
    {
      provide: PipelineEngine,
      inject: [PipelineStore, PipelineStepRegistry, BullStepQueue, PipelineEventsAdapter],
      useFactory: (store: PipelineStore, registry: PipelineStepRegistry, steps: BullStepQueue, events: PipelineEventsAdapter) =>
        new PipelineEngine(store, registry, steps, events, { stepTimeoutMs: STEP_TIMEOUT_MS, logger: new Logger(PipelineEngine.name) }),
    },
    PipelineControlService,
    RunProcessor,
    ...STEP_PROCESSORS,
  ],
  exports: [PipelineStepRegistry, PipelineEngine],
})
export class PipelineModule {}
