import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AskResponse, QaHistoryResponse } from '@meetio/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ParseMeetingIdPipe } from '../common/pipes/parse-meeting-id.pipe.js';
import { UserThrottlerGuard } from '../common/throttler/user-throttler.guard.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { AskGlobalDto, AskMeetingDto, QaHistoryQueryDto } from './dto/qa.dto.js';
import { QaService } from './qa.service.js';

/** Asking costs model calls: 30 questions / hour / user across both endpoints (phase-15 NFR). */
const ASK_LIMIT = { default: { limit: 30, ttl: 3_600_000 } };

/** api-spec §6 — questions about one meeting, or across all of the caller's meetings (US-35→37). */
@ApiTags('qa')
@ApiBearerAuth()
@Controller()
@UseGuards(UserThrottlerGuard)
export class QaController {
  constructor(private readonly qa: QaService) {}

  @Post('meetings/:id/qa')
  @HttpCode(HttpStatus.OK)
  @Throttle(ASK_LIMIT)
  @ApiOperation({ summary: 'Ask about one meeting; the answer cites transcript passages' })
  askMeeting(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string, @Body() dto: AskMeetingDto): Promise<AskResponse> {
    return this.qa.askMeeting(user.userId, id, dto.question.trim());
  }

  @Get('meetings/:id/qa')
  async meetingHistory(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string, @Query() q: QaHistoryQueryDto): Promise<QaHistoryResponse> {
    await this.qa.assertOwnedMeeting(user.userId, id);
    return this.qa.history(user.userId, id, q.before, q.limit);
  }

  @Delete('meetings/:id/qa')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearMeeting(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseMeetingIdPipe) id: string): Promise<void> {
    await this.qa.assertOwnedMeeting(user.userId, id);
    await this.qa.clear(user.userId, id);
  }

  @Post('qa')
  @HttpCode(HttpStatus.OK)
  @Throttle(ASK_LIMIT)
  @ApiOperation({ summary: 'Ask across all your meetings, optionally within dates or about one entity' })
  askGlobal(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskGlobalDto): Promise<AskResponse> {
    return this.qa.askGlobal(user.userId, dto.question.trim(), dto.from, dto.to, dto.entity_id);
  }

  @Get('qa')
  globalHistory(@CurrentUser() user: AuthenticatedUser, @Query() q: QaHistoryQueryDto): Promise<QaHistoryResponse> {
    return this.qa.history(user.userId, null, q.before, q.limit);
  }

  @Delete('qa')
  @HttpCode(HttpStatus.NO_CONTENT)
  clearGlobal(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.qa.clear(user.userId, null);
  }
}
