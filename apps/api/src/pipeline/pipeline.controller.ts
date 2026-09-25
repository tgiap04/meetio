import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ParseMeetingIdPipe } from '../common/pipes/parse-meeting-id.pipe.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { MeetingStateResponseDto } from '../meetings/dto/meeting-responses.dto.js';
import { PipelineControlService } from './pipeline-control.service.js';
import { MeetingStatusResponseDto, ReindexMeetingDto } from './dto/pipeline.dto.js';

@ApiTags('meetings')
@ApiBearerAuth()
@Controller('meetings/:id')
export class PipelineController {
  constructor(private readonly control: PipelineControlService) {}

  @Get('status')
  @ApiOperation({ summary: 'Per-step processing state (US-28)' })
  @ApiOkResponse({ type: MeetingStatusResponseDto })
  status(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string): Promise<MeetingStatusResponseDto> {
    return this.control.status(id, user.userId);
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-run the pipeline: edited parts / resume after failure (changed), or everything (full)' })
  @ApiOkResponse({ type: MeetingStateResponseDto })
  @ApiConflictResponse({ description: 'INVALID_STATE_TRANSITION unless the meeting is ready or failed' })
  reindex(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseMeetingIdPipe) id: string,
    @Body() dto: ReindexMeetingDto,
  ): Promise<MeetingStateResponseDto> {
    return this.control.reindex(id, user.userId, dto.scope);
  }
}
