import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { MeetingRoomNotifierModule } from '../realtime/meeting-room-notifier.module.js';
import { TranslationController } from './translation.controller.js';
import { TranslationService } from './translation.service.js';
import { TranslationStore } from './translation-store.js';

/**
 * Deliberately depends on neither `MeetingsModule` nor `RealtimeModule`: both of
 * those hook translation in after a segment is written, so depending back on them
 * would be a circle. It reads what it needs straight from the tables.
 */
@Module({
  imports: [AiModule, MeetingRoomNotifierModule],
  controllers: [TranslationController],
  providers: [TranslationService, TranslationStore],
  exports: [TranslationService],
})
export class TranslationModule {}
