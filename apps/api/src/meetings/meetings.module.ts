import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ActionItem, Meeting, ProcessingJob, TranscriptSegment } from '../database/entities/index.js';
import { SegmentsModule } from '../segments/segments.module.js';
import { MeetingsController } from './meetings.controller.js';
import { MeetingSegmentsController } from './meeting-segments.controller.js';
import { MeetingsService } from './meetings.service.js';
import { MeetingQueryService } from './meeting-query.service.js';
import { MeetingDeletionService } from './meeting-deletion.service.js';
import { MeetingsRepository } from './meetings.repository.js';
import { MEETING_PROCESSING_QUEUE, MeetingPipelineTrigger } from './meeting-pipeline.trigger.js';

@Module({
  // The BullMQ Redis connection itself is registered once, in JobsModule.
  imports: [
    TypeOrmModule.forFeature([Meeting, ActionItem, ProcessingJob, TranscriptSegment]),
    BullModule.registerQueue({ name: MEETING_PROCESSING_QUEUE }),
    SegmentsModule,
  ],
  controllers: [MeetingsController, MeetingSegmentsController],
  providers: [MeetingsService, MeetingQueryService, MeetingDeletionService, MeetingsRepository, MeetingPipelineTrigger],
  exports: [MeetingsRepository, MeetingPipelineTrigger, MeetingDeletionService],
})
export class MeetingsModule {}
