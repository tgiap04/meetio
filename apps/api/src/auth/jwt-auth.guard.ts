import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ApiErrorCode } from '@meetio/shared';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';

interface JwtErrorInfo {
  name?: string;
}

/**
 * Applied globally (see `AuthModule`'s `APP_GUARD` provider) so every route
 * requires a valid access token by default — `/auth/*` routes opt out
 * individually via `@Public()` (api-spec §1: "trừ nhóm /auth/*").
 * `/auth/logout` deliberately does NOT opt out: it needs the caller's
 * identity to know which refresh token to revoke.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // WebSocket handlers are authenticated once, at the handshake
    // (realtime/ws-auth.middleware.ts), and every handler reads the user from
    // `socket.data`. This guard reads an HTTP `Authorization` header that a WS
    // message does not have, so running it there would 500 every event.
    if (context.getType() !== 'http') {
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser | false, info: JwtErrorInfo | undefined): TUser {
    if (err || !user) {
      const expired = info?.name === 'TokenExpiredError';
      throw new UnauthorizedException({
        code: expired ? ApiErrorCode.TOKEN_EXPIRED : ApiErrorCode.UNAUTHORIZED,
        message: expired ? 'Access token đã hết hạn' : 'Thiếu hoặc sai token',
      });
    }
    return user;
  }
}
