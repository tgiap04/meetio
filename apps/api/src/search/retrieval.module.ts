import { Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiModule } from '../ai/ai.module.js';
import { GeminiClient } from '../ai/gemini.client.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { PipelineStepRegistry } from '../pipeline/pipeline-step-handler.js';
import { VectorRepository } from '../database/vector.repository.js';
import { ChunkStepHandler } from '../chunking/chunk-step.handler.js';
import { EmbedStepHandler } from '../chunking/embed-step.handler.js';
import { SearchService } from './search.service.js';
import { SearchController } from './search.controller.js';

/**
 * Phase 12: the first two real pipeline steps (chunk, embed) and semantic
 * search over their output. Handlers register on module init — before BullMQ
 * workers start on application bootstrap — so a run never pauses at them.
 */
@Module({
  imports: [AiModule, PipelineModule],
  controllers: [SearchController],
  providers: [VectorRepository, SearchService],
})
export class RetrievalModule implements OnModuleInit {
  constructor(
    private readonly registry: PipelineStepRegistry,
    private readonly dataSource: DataSource,
    private readonly gemini: GeminiClient,
  ) {}

  onModuleInit(): void {
    this.registry.register(new ChunkStepHandler(this.dataSource));
    this.registry.register(new EmbedStepHandler(this.dataSource, this.gemini));
  }
}
