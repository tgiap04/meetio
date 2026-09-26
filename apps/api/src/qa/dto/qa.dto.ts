import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import type { AskGlobalRequest, AskMeetingRequest } from '@meetio/shared';

export class AskMeetingDto implements AskMeetingRequest {
  @ApiProperty({ minLength: 1, maxLength: 1000 }) @IsString() @Length(1, 1000) @Matches(/\S/) question!: string;
}

export class AskGlobalDto extends AskMeetingDto implements AskGlobalRequest {
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() entity_id?: string;
}

export class QaHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Message id: load messages older than it' }) @IsOptional() @IsUUID() before?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
