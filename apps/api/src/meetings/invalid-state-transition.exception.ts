import { ConflictException } from '@nestjs/common';
import { ApiErrorCode } from '@meetio/shared';
import type { MeetingStatus } from '../database/enums/meeting-status.enum.js';

/** 409 for any lifecycle move the state machine does not allow — e.g. a second `end`. */
export class InvalidStateTransitionException extends ConflictException {
  constructor(from: MeetingStatus, action: string) {
    super({
      code: ApiErrorCode.INVALID_STATE_TRANSITION,
      message: `Không thể ${action} cuộc họp đang ở trạng thái ${from}`,
      details: { from, action },
    });
  }
}
