import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import type { BulkSegmentsRequest, BulkSegmentsResponse } from '@meetio/shared';
import { SegmentDto } from './segment.dto.js';

export class BulkSegmentsDto implements BulkSegmentsRequest {
  @ApiProperty({ type: [SegmentDto], maxItems: 1000 })
  @IsArray()
  @ArrayMinSize(1)
  // 10 minutes offline at 2 segments/s is ~1200: the client pages its queue in chunks.
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => SegmentDto)
  segments!: SegmentDto[];
}

export class BulkSegmentsResponseDto implements BulkSegmentsResponse {
  @ApiProperty({ type: [Number] })
  acked_seqs!: number[];
}
