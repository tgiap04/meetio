import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  EntityDetail,
  EntityListResponse,
  EntityTimelineResponse,
  MeetingGraphResponse,
  MergeEntitiesResponse,
  MergeSuggestionsResponse,
} from '@meetio/shared';
import { ApiErrorCode } from '@meetio/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ParseMeetingIdPipe } from '../common/pipes/parse-meeting-id.pipe.js';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { EntityListQueryDto, MergeEntitiesDto, TimelineQueryDto, UpdateEntityDto } from './dto/graph.dto.js';
import { EntityQueryService } from './entity-query.service.js';
import { EntityEditService } from './entity-edit.service.js';
import { EntityMergeService } from './entity-merge.service.js';
import { GraphOverviewService } from './graph-overview.service.js';

const Id = new ParseUUIDPipe({ exceptionFactory: () => new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy thực thể') });

/** api-spec §7 — the caller's knowledge graph (US-38→41). Static routes are declared before `:id`. */
@ApiTags('graph')
@ApiBearerAuth()
@Controller()
export class GraphController {
  constructor(
    private readonly entities: EntityQueryService,
    private readonly edits: EntityEditService,
    private readonly merges: EntityMergeService,
    private readonly overview: GraphOverviewService,
  ) {}

  @Get('meetings/:id/graph')
  @ApiOperation({ summary: 'Entities and relations this meeting produced (screen 10)' })
  meetingGraph(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string): Promise<MeetingGraphResponse> {
    return this.overview.meetingGraph(user.userId, id);
  }

  @Get('entities')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: EntityListQueryDto): Promise<EntityListResponse> {
    return this.entities.list(user.userId, query);
  }

  @Get('entities/merge-suggestions')
  suggestions(@CurrentUser() user: AuthenticatedUser): Promise<MergeSuggestionsResponse> {
    return this.overview.suggestions(user.userId);
  }

  @Post('entities/merge-suggestions/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id', Id) id: string): Promise<void> {
    return this.edits.rejectSuggestion(user.userId, id);
  }

  @Post('entities/merge')
  @HttpCode(HttpStatus.OK)
  merge(@CurrentUser() user: AuthenticatedUser, @Body() dto: MergeEntitiesDto): Promise<MergeEntitiesResponse> {
    return this.merges.merge(user.userId, dto.keep_id, dto.merge_ids);
  }

  @Post('entities/merge/:id/undo')
  @HttpCode(HttpStatus.OK)
  undo(@CurrentUser() user: AuthenticatedUser, @Param('id', Id) id: string): Promise<EntityDetail> {
    return this.merges.undo(user.userId, id);
  }

  @Get('entities/:id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', Id) id: string): Promise<EntityDetail> {
    return this.entities.detail(user.userId, id);
  }

  @Get('entities/:id/timeline')
  timeline(@CurrentUser() user: AuthenticatedUser, @Param('id', Id) id: string, @Query() query: TimelineQueryDto): Promise<EntityTimelineResponse> {
    return this.entities.timeline(user.userId, id, query);
  }

  @Patch('entities/:id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', Id) id: string, @Body() dto: UpdateEntityDto): Promise<EntityDetail> {
    return this.edits.update(user.userId, id, dto);
  }

  @Delete('entities/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', Id) id: string): Promise<void> {
    return this.edits.remove(user.userId, id);
  }
}
