import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { ListMeetingsQuery } from '@meetio/shared';
import { MeetingStatus } from '../../database/enums/meeting-status.enum.js';

export class ListMeetingsQueryDto implements ListMeetingsQuery {
  @ApiPropertyOptional({ description: 'Accent-insensitive title search' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  q?: string;

  @ApiPropertyOptional({ description: 'created_at >= from (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'created_at <= to (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: MeetingStatus })
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'next_cursor from the previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
