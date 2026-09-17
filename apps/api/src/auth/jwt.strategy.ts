import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ApiErrorCode } from '@meetio/shared';
import type { AuthenticatedUser, JwtPayload } from './jwt-payload.type.js';

/**
 * Validates the `Authorization: Bearer` access token. `passport-jwt` itself
 * throws when the token is expired or malformed; Nest's `AuthGuard('jwt')`
 * turns that into a 401 whose default code (`UNAUTHORIZED`) is wrong for an
 * *expired* token specifically (api-spec §9 wants `TOKEN_EXPIRED` so the
 * client knows to refresh instead of re-prompting login) — `JwtAuthGuard`
 * inspects the passport error to pick between the two.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is required');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload?.sub || !payload?.jti) {
      throw new UnauthorizedException({ code: ApiErrorCode.UNAUTHORIZED, message: 'Token không hợp lệ' });
    }
    return { userId: payload.sub, jti: payload.jti };
  }
}
