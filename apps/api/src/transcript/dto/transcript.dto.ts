import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { ListSegmentsQuery, ListSegmentsResponse, TranscriptSegmentItem, UpdateSegmentRequest } from '@meetio/shared';

export class ListSegmentsQueryDto implements ListSegmentsQuery {
  @ApiPropertyOptional({ default: 1, description: 'First seq to return (inclusive)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  from_seq?: number;

  @ApiPropertyOptional({ default: 200, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class UpdateSegmentDto implements UpdateSegmentRequest {
  @ApiProperty({ maxLength: 10_000 })
  @IsString()
  @Length(1, 10_000)
  text!: string;
}

export class TranscriptSegmentItemDto implements TranscriptSegmentItem {
  @ApiProperty() id!: string;
  @ApiProperty() seq!: number;
  @ApiProperty() text!: string;
  @ApiProperty() started_at_ms!: number;
  @ApiProperty() ended_at_ms!: number;
  @ApiProperty({ nullable: true, type: Number }) gap_before_ms!: number | null;
  @ApiProperty() is_edited!: boolean;
  @ApiProperty({ nullable: true, type: String }) translated_text!: string | null;
  @ApiProperty({ nullable: true, type: String }) translated_to!: string | null;
}

export class ListSegmentsResponseDto implements ListSegmentsResponse {
  @ApiProperty({ type: [TranscriptSegmentItemDto] }) items!: TranscriptSegmentItemDto[];
  @ApiProperty({ nullable: true, type: Number }) next_from_seq!: number | null;
}
