import { UnauthorizedException } from '@nestjs/common';
import type { TokenPayload } from 'google-auth-library';
import { ApiErrorCode } from '@meetio/shared';

/**
 * Claims we actually trust out of a verified Google ID token. Nothing else
 * from `TokenPayload` is a source of truth for us (decisions.md §1, §3).
 */
export interface GoogleIdentityClaims {
  sub: string;
  email: string;
  /** From `name`, falling back to the part of `email` before `@`. */
  display_name: string;
}

/**
 * Turns an already-signature-verified `TokenPayload` into `GoogleIdentityClaims`,
 * or throws. Never returns a half-formed claim set — every caller downstream
 * of this function can assume `email_verified === true`, `sub`, and `email`
 * are all present.
 *
 * The `email_verified` gate runs FIRST, before the `sub`/`email` presence
 * checks and before any caller can reach a `users` lookup — see phase-03
 * §Bảo mật for the account-takeover this ordering closes.
 */
export function toGoogleIdentity(payload: TokenPayload): GoogleIdentityClaims {
  if (payload.email_verified !== true) {
    if (payload.email_verified === false) {
      throw new UnauthorizedException({
        code: ApiErrorCode.GOOGLE_EMAIL_UNVERIFIED,
        message: 'Email Google chưa được xác minh',
      });
    }
    // `email_verified` missing entirely is not a legitimate "unverified"
    // answer from Google — it means the token is malformed or missing the
    // scope we require. Treat it as an invalid token, not an unverified email.
    throw tokenInvalid();
  }

  if (!payload.sub || !payload.email) {
    throw tokenInvalid();
  }

  const trimmedName = payload.name?.trim();
  const display_name = trimmedName && trimmedName.length > 0 ? trimmedName : payload.email.split('@')[0];

  return { sub: payload.sub, email: payload.email, display_name };
}

function tokenInvalid(): UnauthorizedException {
  return new UnauthorizedException({
    code: ApiErrorCode.GOOGLE_TOKEN_INVALID,
    message: 'Google ID token không hợp lệ',
  });
}
