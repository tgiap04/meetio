import { Module } from '@nestjs/common';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { TranslationModule } from '../translation/translation.module.js';
import { TranscriptController } from './transcript.controller.js';
import { TranscriptService } from './transcript.service.js';

@Module({
  imports: [MeetingsModule, TranslationModule],
  controllers: [TranscriptController],
  providers: [TranscriptService],
})
export class TranscriptModule {}
