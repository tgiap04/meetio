import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { SegmentsModule } from '../segments/segments.module.js';
import { MeetingGateway } from './meeting.gateway.js';
import { SegmentIngestHandler } from './segment-ingest.handler.js';
import { SegmentRateLimiter } from './segment-rate-limiter.js';
import { MeetingRoomNotifier } from './meeting-room.notifier.js';

@Module({
  imports: [AuthModule, MeetingsModule, SegmentsModule],
  providers: [MeetingGateway, SegmentIngestHandler, SegmentRateLimiter, MeetingRoomNotifier],
  // Phase 09/11 push translation and pipeline progress through this.
  exports: [MeetingRoomNotifier],
})
export class RealtimeModule {}
