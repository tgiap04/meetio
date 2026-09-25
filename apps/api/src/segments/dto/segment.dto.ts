import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { TranscriptSegmentPayload } from '@meetio/shared';

const MAX_MS = 2_147_483_647; // INT column

/**
 * One finalised segment. Shared by the WebSocket gateway (validated by hand)
 * and the bulk endpoint (validated by the global pipe), so both paths accept
 * exactly the same thing. There is no speaker field (US-13 dropped).
 */
export class SegmentDto implements TranscriptSegmentPayload {
  @ApiProperty({ minimum: 1, description: 'Client-assigned, contiguous from 1 per meeting' })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  seq!: number;

  @ApiProperty({ maxLength: 10_000 })
  @IsString()
  @Length(1, 10_000)
  text!: string;

  @ApiProperty({ description: 'ms since the meeting started' })
  @IsInt()
  @Min(0)
  @Max(MAX_MS)
  started_at_ms!: number;

  @ApiProperty({ description: 'ms since the meeting started; >= started_at_ms' })
  @IsInt()
  @Min(0)
  @Max(MAX_MS)
  ended_at_ms!: number;

  @ApiPropertyOptional({ description: 'Recogniser restart gap before this segment, ms' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MS)
  gap_before_ms?: number;
}
