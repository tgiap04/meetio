import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { SegmentsModule } from '../segments/segments.module.js';
import { MeetingRoomNotifierModule } from './meeting-room-notifier.module.js';
import { MeetingGateway } from './meeting.gateway.js';
import { SegmentIngestHandler } from './segment-ingest.handler.js';
import { SegmentRateLimiter } from './segment-rate-limiter.js';

@Module({
  imports: [AuthModule, MeetingsModule, SegmentsModule, MeetingRoomNotifierModule],
  providers: [MeetingGateway, SegmentIngestHandler, SegmentRateLimiter],
  // Phase 11 pushes pipeline progress through this.
  exports: [MeetingRoomNotifierModule],
})
export class RealtimeModule {}
