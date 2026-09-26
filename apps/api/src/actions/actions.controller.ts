import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode, type ActionFiltersResponse, type ActionListResponse, type MeetingActionItem, type MeetingSummaryResponse } from '@meetio/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ParseMeetingIdPipe } from '../common/pipes/parse-meeting-id.pipe.js';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { ActionListQueryDto, CreateActionItemDto, UpdateActionItemDto } from './dto/actions.dto.js';
import { ActionsService } from './actions.service.js';

const ItemId = new ParseUUIDPipe({ exceptionFactory: () => new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy việc cần làm') });

/** api-spec §5 — summaries and action items (US-31→34). */
@ApiTags('actions')
@ApiBearerAuth()
@Controller()
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get('meetings/:id/summary')
  @ApiOperation({ summary: 'Cited summary: every point leads back to the transcript' })
  summary(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string): Promise<MeetingSummaryResponse> {
    return this.actions.summary(user.userId, id);
  }

  @Get('meetings/:id/actions')
  forMeeting(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string): Promise<{ items: MeetingActionItem[] }> {
    return this.actions.forMeeting(user.userId, id);
  }

  @Post('meetings/:id/actions')
  @ApiOperation({ summary: 'Add a task the AI missed' })
  create(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string, @Body() dto: CreateActionItemDto): Promise<MeetingActionItem> {
    return this.actions.create(user.userId, id, dto);
  }

  @Get('actions')
  @ApiOperation({ summary: 'All action items across meetings; open first, done last' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ActionListQueryDto): Promise<ActionListResponse> {
    return this.actions.list(user.userId, query);
  }

  @Get('actions/filters')
  @ApiOperation({ summary: 'Assignees and meetings with open items, plus the exact open count' })
  filters(@CurrentUser() user: AuthenticatedUser): Promise<ActionFiltersResponse> {
    return this.actions.filters(user.userId);
  }

  @Patch('actions/:id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ItemId) id: string, @Body() dto: UpdateActionItemDto): Promise<MeetingActionItem> {
    return this.actions.update(user.userId, id, dto);
  }

  @Delete('actions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ItemId) id: string): Promise<void> {
    return this.actions.remove(user.userId, id);
  }
}
