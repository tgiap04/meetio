import { ApiErrorCode } from '@meetio/shared';

/**
 * A batch the database refused on purpose — the meeting is gone, or past the
 * point where new transcript may arrive. Carries the api-spec §9 code the
 * client needs to decide between "drop it" and "keep it queued".
 */
export class SegmentRejectedError extends Error {
  constructor(
    readonly code: typeof ApiErrorCode.MEETING_NOT_FOUND | typeof ApiErrorCode.INVALID_STATE_TRANSITION,
    message: string,
  ) {
    super(message);
    this.name = 'SegmentRejectedError';
  }
}
