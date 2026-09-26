import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { QaController } from './qa.controller.js';
import { QaService } from './qa.service.js';

/** Phase 15: GraphRAG question answering (docs/system-architecture.md §4). */
@Module({
  imports: [AiModule],
  controllers: [QaController],
  providers: [QaService],
})
export class QaModule {}
