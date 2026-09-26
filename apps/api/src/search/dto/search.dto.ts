import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { SearchQuery, SearchResponse, SearchResultItem } from '@meetio/shared';

export class SearchQueryDto implements SearchQuery {
  @ApiProperty({ description: 'What you are looking for, in your own words' })
  @IsString()
  @Length(2, 500)
  q!: string;

  @ApiPropertyOptional({ description: 'Meeting started at or after (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Meeting started at or before (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ default: 0, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  offset?: number;
}

export class SearchResultItemDto implements SearchResultItem {
  @ApiProperty() chunk_id!: string;
  @ApiProperty() meeting_id!: string;
  @ApiProperty() meeting_title!: string;
  @ApiProperty({ nullable: true, type: String }) meeting_date!: string | null;
  @ApiProperty() excerpt!: string;
  @ApiProperty({ description: 'Open the transcript at this seq' }) segment_seq!: number;
  @ApiProperty() segment_end_seq!: number;
  @ApiProperty({ description: 'Cosine similarity, 0..1' }) score!: number;
}

export class SearchResponseDto implements SearchResponse {
  @ApiProperty({ type: [SearchResultItemDto] }) items!: SearchResultItemDto[];
  @ApiProperty({ nullable: true, type: Number }) next_offset!: number | null;
}
