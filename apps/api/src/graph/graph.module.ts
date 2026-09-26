import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AiModule } from '../ai/ai.module.js';
import { GeminiClient } from '../ai/gemini.client.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { PipelineStepRegistry } from '../pipeline/pipeline-step-handler.js';
import { DEFAULT_RESOLVER_OPTIONS, EntityResolver, type ResolverOptions } from './entity-resolver.js';
import { ExtractStepHandler } from './extract-step.handler.js';
import { ResolveStepHandler } from './resolve-step.handler.js';
import { EntityQueryService } from './entity-query.service.js';
import { EntityEditService } from './entity-edit.service.js';
import { EntityMergeService } from './entity-merge.service.js';
import { GraphOverviewService } from './graph-overview.service.js';
import { GraphController } from './graph.controller.js';

/** A similarity in (0, 1]; anything else (unset, "off", typo) falls back. */
const similarity = (raw: string | undefined, fallback: number | null): number | null => {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
};

export function resolverOptionsFrom(config: ConfigService): ResolverOptions {
  return {
    ...DEFAULT_RESOLVER_OPTIONS,
    suggestThreshold: similarity(config.get<string>('ENTITY_SUGGEST_THRESHOLD'), DEFAULT_RESOLVER_OPTIONS.suggestThreshold)!,
    // Off unless set: uncalibrated auto-merges corrupt the graph for good (OQ-03, clarifications 2026-09-26).
    autoMergeThreshold: similarity(config.get<string>('ENTITY_AUTO_MERGE_THRESHOLD'), null),
  };
}

/** Phase 13: pipeline steps `extract` + `resolve` and the graph API. */
@Module({
  imports: [AiModule, PipelineModule],
  controllers: [GraphController],
  providers: [EntityQueryService, EntityEditService, EntityMergeService, GraphOverviewService],
})
export class GraphModule implements OnModuleInit {
  constructor(
    private readonly registry: PipelineStepRegistry,
    private readonly dataSource: DataSource,
    private readonly gemini: GeminiClient,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.registry.register(new ExtractStepHandler(this.dataSource, this.gemini));
    this.registry.register(new ResolveStepHandler(this.dataSource, this.gemini, new EntityResolver(resolverOptionsFrom(this.config))));
  }
}
