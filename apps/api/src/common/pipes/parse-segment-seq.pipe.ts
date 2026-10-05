import type { PipeTransform } from '@nestjs/common';
import { ApiErrorCode } from '@meetio/shared';
import { OwnershipViolationException } from '../exceptions/ownership-violation.exception.js';

const INT4_MAX = 2_147_483_647;

/**
 * `:seq` is a Postgres int4. Anything else — letters, negatives, a number past int4 (which would
 * reach the driver as a 500) — is answered like a segment that does not exist.
 */
export const ParseSegmentSeqPipe: PipeTransform<string, number> = {
  transform(value) {
    const seq = /^\d{1,10}$/.test(value) ? Number(value) : NaN;
    if (!Number.isInteger(seq) || seq > INT4_MAX) {
      throw new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy đoạn transcript');
    }
    return seq;
  },
};
