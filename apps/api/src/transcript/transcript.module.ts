import { Module } from '@nestjs/common';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { TranscriptController } from './transcript.controller.js';
import { TranscriptService } from './transcript.service.js';

@Module({
  imports: [MeetingsModule],
  controllers: [TranscriptController],
  providers: [TranscriptService],
})
export class TranscriptModule {}
