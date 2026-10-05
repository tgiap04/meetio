import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { STT_LANGUAGES, type SttLanguage, type TranscribeAudioFields } from '@meetio/shared';

/** The text fields of the multipart body; the `audio` file part is validated by the controller. */
export class TranscribeAudioDto implements TranscribeAudioFields {
  @ApiProperty({ enum: STT_LANGUAGES }) @IsIn(STT_LANGUAGES, { message: 'language phải là vi-VN hoặc en-US' }) language!: SttLanguage;
  @ApiPropertyOptional({ format: 'uuid', description: 'Only attributes Gemini usage; ignored unless it is your own meeting' })
  @IsOptional()
  @IsUUID()
  meeting_id?: string;
}
