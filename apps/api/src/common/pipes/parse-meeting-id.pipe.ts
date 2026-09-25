import { ParseUUIDPipe } from '@nestjs/common';
import { ApiErrorCode } from '@meetio/shared';
import { OwnershipViolationException } from '../exceptions/ownership-violation.exception.js';

/**
 * `:id` for meeting routes. A malformed id is answered exactly like someone
 * else's meeting — 404 MEETING_NOT_FOUND — instead of reaching Postgres as a
 * failed uuid cast (500) or leaking a different status for "not even a uuid".
 */
export const ParseMeetingIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new OwnershipViolationException(ApiErrorCode.MEETING_NOT_FOUND, 'Không tìm thấy cuộc họp'),
});
