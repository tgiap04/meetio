import { Controller, HttpCode, HttpStatus, Param, Post, type PipeTransform } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode, type SegmentTranslation } from '@meetio/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ParseMeetingIdPipe } from '../common/pipes/parse-meeting-id.pipe.js';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { SegmentTranslationDto } from './dto/segment-translation.dto.js';
import { TranslationService } from './translation.service.js';

const INT4_MAX = 2_147_483_647;

/**
 * `:seq` is a Postgres int4. Anything else — letters, negatives, a number past int4 (which would
 * reach the driver as a 500) — is answered like a segment that does not exist.
 */
const ParseSeqPipe: PipeTransform<string, number> = {
  transform(value) {
    const seq = /^\d{1,10}$/.test(value) ? Number(value) : NaN;
    if (!Number.isInteger(seq) || seq > INT4_MAX) {
      throw new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy đoạn transcript');
    }
    return seq;
  },
};

@ApiTags('segments')
@ApiBearerAuth()
@Controller('meetings/:id/segments/:seq')
export class TranslationController {
  constructor(private readonly translation: TranslationService) {}

  @Post('translate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Translate one segment again after an automatic failure; idempotent once translated' })
  @ApiOkResponse({ type: SegmentTranslationDto })
  @ApiNotFoundResponse({ description: 'Meeting or segment not found (or not yours)' })
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseMeetingIdPipe) id: string,
    @Param('seq', ParseSeqPipe) seq: number,
  ): Promise<SegmentTranslation> {
    return this.translation.retry(id, user.userId, seq);
  }
}
