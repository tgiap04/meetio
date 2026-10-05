import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches } from 'class-validator';
import type { PutSegmentTranslationRequest } from '@meetio/shared';
import { TRANSLATION_LANGUAGES } from '../translate-target.js';

export class PutSegmentTranslationDto implements PutSegmentTranslationRequest {
  @ApiProperty({ minLength: 1, maxLength: 10000 })
  @IsString()
  @Length(1, 10_000)
  @Matches(/\S/, { message: 'translated_text must not be blank' })
  translated_text!: string;

  @ApiProperty({ enum: TRANSLATION_LANGUAGES, example: 'en-US', description: 'Must equal the meeting translate_to' })
  @IsIn(TRANSLATION_LANGUAGES)
  translated_to!: PutSegmentTranslationRequest['translated_to'];
}
