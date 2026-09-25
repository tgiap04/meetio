import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
import type { UpdateMeetingRequest } from '@meetio/shared';
import { LANGUAGE_TAG } from './create-meeting.dto.js';

export class UpdateMeetingDto implements UpdateMeetingRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null turns translation off' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(LANGUAGE_TAG)
  translate_to?: string | null;
}
