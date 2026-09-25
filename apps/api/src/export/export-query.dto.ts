import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { EXPORT_SECTIONS, type ExportMeetingQuery } from '@meetio/shared';

export class ExportMeetingQueryDto implements ExportMeetingQuery {
  @ApiProperty({ enum: ['markdown', 'html'] })
  @IsIn(['markdown', 'html'])
  format!: 'markdown' | 'html';

  @ApiPropertyOptional({ description: `Comma list of ${EXPORT_SECTIONS.join(', ')}; default all` })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  include?: string;
}
