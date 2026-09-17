import { HttpStatus, NotFoundException } from '@nestjs/common';
import { ApiErrorCode } from '@meetio/shared';

/**
 * Thrown by `ScopedRepository` (and anything built on it) whenever a query
 * scoped to `userId` finds no matching row — whether the id genuinely does
 * not exist or belongs to someone else. The two cases are indistinguishable
 * on purpose: returning 403 instead of 404 would leak that the resource
 * exists (api-spec §0). Always maps to HTTP 404.
 */
export class OwnershipViolationException extends NotFoundException {
  constructor(
    public readonly code: ApiErrorCode = ApiErrorCode.MEETING_NOT_FOUND,
    message = 'Không tìm thấy tài nguyên',
  ) {
    super({ code, message, details: {} });
  }

  static readonly httpStatus = HttpStatus.NOT_FOUND;
}
