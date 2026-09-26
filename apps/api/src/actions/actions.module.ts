import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AiModule } from '../ai/ai.module.js';
import { GeminiClient } from '../ai/gemini.client.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { PipelineStepRegistry } from '../pipeline/pipeline-step-handler.js';
import { SummarizeStepHandler } from '../summaries/summarize-step.handler.js';
import { ActionsController } from './actions.controller.js';
import { ActionsService } from './actions.service.js';

/** Phase 14: pipeline step `summarize` (the last one — runs now reach `ready`) and the summary/action API. */
@Module({
  imports: [AiModule, PipelineModule],
  controllers: [ActionsController],
  providers: [ActionsService],
})
export class ActionsModule implements OnModuleInit {
  constructor(
    private readonly registry: PipelineStepRegistry,
    private readonly dataSource: DataSource,
    private readonly gemini: GeminiClient,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const singlePass = Number(this.config.get<string>('SUMMARY_SINGLE_PASS_TOKENS'));
    this.registry.register(new SummarizeStepHandler(this.dataSource, this.gemini, Number.isFinite(singlePass) && singlePass > 1000 ? singlePass : 60_000));
  }
}
