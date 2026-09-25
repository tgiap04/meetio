import { BadRequestException, Body, ConflictException, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode } from '@meetio/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ParseMeetingIdPipe } from '../common/pipes/parse-meeting-id.pipe.js';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { SegmentUpsertRepository } from '../segments/segment-upsert.repository.js';
import { SegmentRejectedError } from '../segments/segment-rejected.error.js';
import { segmentRuleViolation } from '../segments/segment-rules.js';
import { BulkSegmentsDto, BulkSegmentsResponseDto } from '../segments/dto/bulk-segments.dto.js';
import { MeetingsRepository } from './meetings.repository.js';

/**
 * api-spec §4 `POST /meetings/:id/segments/bulk` — the fallback when the
 * WebSocket is unusable. Same upsert, same idempotency, same state rules as the
 * realtime path; it just acks in one response instead of per event.
 */
@ApiTags('segments')
@ApiBearerAuth()
@Controller('meetings/:id/segments')
export class MeetingSegmentsController {
  constructor(
    private readonly meetings: MeetingsRepository,
    private readonly segments: SegmentUpsertRepository,
  ) {}

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Catch-up sync; upsert by (meeting_id, seq), idempotent' })
  @ApiOkResponse({ type: BulkSegmentsResponseDto })
  async bulk(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseMeetingIdPipe) id: string,
    @Body() dto: BulkSegmentsDto,
  ): Promise<BulkSegmentsResponseDto> {
    const invalid = dto.segments.map((s) => [s.seq, segmentRuleViolation(s)] as const).filter(([, reason]) => reason);
    if (invalid.length > 0) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Đoạn transcript không hợp lệ',
        details: { segments: Object.fromEntries(invalid) },
      });
    }
    await this.meetings.findOneOrFail(id, user.userId);
    try {
      await this.segments.upsertMany(id, dto.segments);
    } catch (error) {
      throw toHttpError(error);
    }
    return { acked_seqs: [...new Set(dto.segments.map((s) => s.seq))].sort((a, b) => a - b) };
  }
}

function toHttpError(error: unknown): unknown {
  if (!(error instanceof SegmentRejectedError)) {
    return error;
  }
  return error.code === ApiErrorCode.MEETING_NOT_FOUND
    ? new OwnershipViolationException(ApiErrorCode.MEETING_NOT_FOUND, error.message)
    : new ConflictException({ code: error.code, message: error.message, details: {} });
}
