import { BadRequestException } from '@nestjs/common';
import { ApiErrorCode } from '@meetio/shared';

/**
 * Opaque keyset cursor for `GET /meetings` (api-spec §0): the last row's
 * `(created_at, id)`. Keyset rather than offset so a meeting created while the
 * user scrolls neither duplicates nor hides a row on the next page.
 *
 * `createdAt` is PostgreSQL's own microsecond text, never a JS `Date`: a `Date`
 * truncates to milliseconds, and two meetings inside the same millisecond would
 * then compare wrong at the page boundary and one would silently disappear.
 */
export interface MeetingCursor {
  createdAt: string;
  id: string;
}

export function encodeMeetingCursor(cursor: MeetingCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString('base64url');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PG_UTC_MICROS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function decodeMeetingCursor(raw: string): MeetingCursor {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as [unknown, unknown];
    if (typeof createdAt !== 'string' || !PG_UTC_MICROS.test(createdAt) || typeof id !== 'string' || !UUID.test(id)) {
      throw new Error('malformed');
    }
    return { createdAt, id };
  } catch {
    throw new BadRequestException({
      code: ApiErrorCode.VALIDATION_ERROR,
      message: 'cursor không hợp lệ',
      details: { cursor: 'invalid' },
    });
  }
}
