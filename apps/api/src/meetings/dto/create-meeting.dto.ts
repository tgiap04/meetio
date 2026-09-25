import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
import type { CreateMeetingRequest } from '@meetio/shared';
import { AudioSource } from '../../database/enums/audio-source.enum.js';
import { RecordingQuality } from '../../database/enums/recording-quality.enum.js';

/** BCP-47 as the recognisers emit it: `vi-VN`, `en`, `zh-Hant-TW`. */
export const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export class CreateMeetingDto implements CreateMeetingRequest {
  @ApiPropertyOptional({ description: 'Defaults to "Cuộc họp DD/MM HH:mm" (Vietnam time)' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiProperty({ example: 'vi-VN' })
  @IsString()
  @Matches(LANGUAGE_TAG)
  source_language!: string;

  @ApiPropertyOptional({ nullable: true, example: 'en', description: 'null or omitted = translation off' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(LANGUAGE_TAG)
  translate_to?: string | null;

  @ApiProperty({ enum: AudioSource })
  @IsEnum(AudioSource)
  audio_source!: AudioSource;

  @ApiProperty({ enum: RecordingQuality })
  @IsEnum(RecordingQuality)
  recording_quality!: RecordingQuality;
}
