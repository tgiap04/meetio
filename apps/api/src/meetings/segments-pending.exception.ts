import { ConflictException } from '@nestjs/common';
import { ApiErrorCode, type SegmentsPendingDetails } from '@meetio/shared';

/** 409 from `end` while seqs 1..last_seq are not all durable yet — `details` says which to resend. */
export class SegmentsPendingException extends ConflictException {
  constructor(details: SegmentsPendingDetails) {
    super({
      code: ApiErrorCode.SEGMENTS_PENDING,
      message: `Còn ${details.missing_count} đoạn transcript chưa đồng bộ`,
      details,
    });
  }
}
