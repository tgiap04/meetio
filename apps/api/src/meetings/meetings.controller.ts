import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ParseMeetingIdPipe } from '../common/pipes/parse-meeting-id.pipe.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { MeetingsService } from './meetings.service.js';
import { MeetingQueryService } from './meeting-query.service.js';
import { MeetingDeletionService } from './meeting-deletion.service.js';
import { toMeetingListItem } from './meeting-mappers.js';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';
import { EndMeetingDto } from './dto/end-meeting.dto.js';
import { UpdateMeetingDto } from './dto/update-meeting.dto.js';
import { ListMeetingsQueryDto } from './dto/list-meetings.query.dto.js';
import {
  CreateMeetingResponseDto,
  ListMeetingsResponseDto,
  MeetingDetailResponseDto,
  MeetingListItemDto,
  MeetingStateResponseDto,
} from './dto/meeting-responses.dto.js';

/** api-spec §3. `user_id` only ever comes from the token, never from a body or query. */
@ApiTags('meetings')
@ApiBearerAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly lifecycle: MeetingsService,
    private readonly queries: MeetingQueryService,
    private readonly deletion: MeetingDeletionService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create the meeting when recording starts — returns its id before the mic opens' })
  @ApiCreatedResponse({ type: CreateMeetingResponseDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMeetingDto): Promise<CreateMeetingResponseDto> {
    return this.lifecycle.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List meetings, newest first, cursor-paginated' })
  @ApiOkResponse({ type: ListMeetingsResponseDto })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMeetingsQueryDto): Promise<ListMeetingsResponseDto> {
    return this.queries.list(user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Metadata, summary, action items and processing steps (no segments)' })
  @ApiOkResponse({ type: MeetingDetailResponseDto })
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string): Promise<MeetingDetailResponseDto> {
    return this.queries.detail(id, user.userId);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'recording → paused' })
  @ApiOkResponse({ type: MeetingStateResponseDto })
  @ApiConflictResponse({ description: 'INVALID_STATE_TRANSITION' })
  pause(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string): Promise<MeetingStateResponseDto> {
    return this.lifecycle.pause(id, user.userId);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'paused → recording' })
  @ApiOkResponse({ type: MeetingStateResponseDto })
  @ApiConflictResponse({ description: 'INVALID_STATE_TRANSITION' })
  resume(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string): Promise<MeetingStateResponseDto> {
    return this.lifecycle.resume(id, user.userId);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'recording|paused → ended → queued, once seqs 1..last_seq are all persisted' })
  @ApiOkResponse({ type: MeetingStateResponseDto })
  @ApiConflictResponse({ description: 'INVALID_STATE_TRANSITION, or SEGMENTS_PENDING with details.missing_seqs' })
  end(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseMeetingIdPipe) id: string,
    @Body() dto: EndMeetingDto,
  ): Promise<MeetingStateResponseDto> {
    return this.lifecycle.end(id, user.userId, dto.last_seq);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, or change the translation target' })
  @ApiOkResponse({ type: MeetingListItemDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseMeetingIdPipe) id: string,
    @Body() dto: UpdateMeetingDto,
  ): Promise<MeetingListItemDto> {
    return toMeetingListItem(await this.lifecycle.update(id, user.userId, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete permanently, cascading to everything derived from it' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string): Promise<void> {
    await this.deletion.delete(id, user.userId);
  }
}
