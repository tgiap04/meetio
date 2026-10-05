import { ApiProperty } from '@nestjs/swagger';
import type { SegmentTranslation } from '@meetio/shared';

export class SegmentTranslationDto implements SegmentTranslation {
  @ApiProperty() seq!: number;
  @ApiProperty() translated_text!: string;
  @ApiProperty({ example: 'en-US' }) translated_to!: string;
}
