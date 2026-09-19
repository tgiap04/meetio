import { BadRequestException } from '@nestjs/common';
import { ApiErrorCode } from '@meetio/shared';
import type { DeleteMeDto } from './dto/delete-me.dto.js';

/**
 * `DELETE /users/me` accepts exactly ONE step-up credential per request.
 * "Neither sent" is already caught downstream by whichever per-account
 * branch `UsersService.deleteMe` picks (it reports the specific missing
 * field, e.g. `details.google_id_token = ['required_for_google_account']`).
 * "Both sent" is NOT caught downstream — the branch that matches the
 * account would just verify its own field and silently ignore the other,
 * which is exactly what phase-12 "Other requirements" forbids: never let a
 * request pass with an extra, unchecked credential riding along.
 */
export function checkExactlyOneDeleteCredential(dto: DeleteMeDto): void {
  if (dto.password !== undefined && dto.google_id_token !== undefined) {
    throw new BadRequestException({
      code: ApiErrorCode.VALIDATION_ERROR,
      message: 'Gửi đúng một trong hai: password hoặc google_id_token',
      details: { credential: ['exactly_one_required'] },
    });
  }
}
