import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ParseMeetingIdPipe } from '../common/pipes/parse-meeting-id.pipe.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { ExportService } from './export.service.js';
import { ExportMeetingQueryDto } from './export-query.dto.js';

@ApiTags('meetings')
@ApiBearerAuth()
@Controller('meetings/:id/export')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Get()
  @ApiOperation({ summary: 'Minutes as Markdown, or HTML for on-device PDF printing' })
  @ApiProduces('text/markdown', 'text/html')
  @ApiOkResponse({ description: 'The document body' })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseMeetingIdPipe) id: string,
    @Query() query: ExportMeetingQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const rendered = await this.exports.render(id, user.userId, query.format, query.include);
    res.setHeader('Content-Type', rendered.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${rendered.filename}"`);
    // Personal data: never let a proxy or the OS HTTP cache keep a copy.
    res.setHeader('Cache-Control', 'no-store');
    return rendered.body;
  }
}
