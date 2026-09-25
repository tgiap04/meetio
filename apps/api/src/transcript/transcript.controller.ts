import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode } from '@meetio/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ParseMeetingIdPipe } from '../common/pipes/parse-meeting-id.pipe.js';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { TranscriptService } from './transcript.service.js';
import { ListSegmentsQueryDto, ListSegmentsResponseDto, TranscriptSegmentItemDto, UpdateSegmentDto } from './dto/transcript.dto.js';

const ParseSegmentIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy đoạn transcript'),
});

/** api-spec §4 — reading the transcript page by page, and correcting a segment. */
@ApiTags('segments')
@ApiBearerAuth()
@Controller()
export class TranscriptController {
  constructor(private readonly transcript: TranscriptService) {}

  @Get('meetings/:id/segments')
  @ApiOperation({ summary: 'Transcript segments ordered by seq; page with next_from_seq' })
  @ApiOkResponse({ type: ListSegmentsResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseMeetingIdPipe) id: string,
    @Query() query: ListSegmentsQueryDto,
  ): Promise<ListSegmentsResponseDto> {
    return this.transcript.list(id, user.userId, query.from_seq, query.limit);
  }

  @Patch('segments/:id')
  @ApiOperation({ summary: 'Correct a segment; marks it edited. Does not re-run the pipeline — call reindex for that' })
  @ApiOkResponse({ type: TranscriptSegmentItemDto })
  @ApiConflictResponse({ description: 'INVALID_STATE_TRANSITION while recording, paused or processing' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseSegmentIdPipe) id: string,
    @Body() dto: UpdateSegmentDto,
  ): Promise<TranscriptSegmentItemDto> {
    return this.transcript.update(id, user.userId, dto.text);
  }
}
