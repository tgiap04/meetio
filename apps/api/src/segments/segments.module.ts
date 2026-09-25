import { Module } from '@nestjs/common';
import { SegmentUpsertRepository } from './segment-upsert.repository.js';
import { SegmentBatchWriter } from './segment-batch-writer.service.js';

/**
 * The one write path for transcript segments, shared by the WebSocket gateway
 * and the REST fallback. Deliberately depends on no feature module, so both
 * `MeetingsModule` (to flush before `end`) and `RealtimeModule` can import it.
 */
@Module({
  providers: [SegmentUpsertRepository, SegmentBatchWriter],
  exports: [SegmentUpsertRepository, SegmentBatchWriter],
})
export class SegmentsModule {}
