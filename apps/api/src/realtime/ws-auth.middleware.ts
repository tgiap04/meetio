import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { ApiErrorCode } from '@meetio/shared';
import type { JwtPayload } from '../auth/jwt-payload.type.js';

/** What the handshake leaves on `socket.data` for every later event. */
export interface MeetingSocketData {
  userId: string;
  /** Access-token expiry, epoch seconds — segments after it are refused so the client refreshes. */
  tokenExp: number;
  meetingId?: string;
}

export type MeetingSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, MeetingSocketData>;

/** A handshake refusal the client can branch on (`err.data.code`), like the HTTP 401s. */
function refusal(code: ApiErrorCode, message: string): Error & { data: { code: ApiErrorCode } } {
  return Object.assign(new Error(message), { data: { code } });
}

function readToken(socket: Socket): string | null {
  const fromAuth = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) {
    return fromAuth.replace(/^Bearer\s+/i, '');
  }
  const header = socket.handshake.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header) : null;
  return match ? match[1] : null;
}

/**
 * phase-05 step 1: no valid access token, no connection. The token comes from
 * `handshake.auth.token` (socket.io's own slot), falling back to an
 * `Authorization: Bearer` header (clarifications 2026-09-25).
 */
export function createWsAuthMiddleware(jwt: JwtService) {
  return async (socket: Socket, next: (err?: Error) => void): Promise<void> => {
    const token = readToken(socket);
    if (!token) {
      next(refusal(ApiErrorCode.UNAUTHORIZED, 'Thiếu token'));
      return;
    }
    try {
      const payload = await jwt.verifyAsync<JwtPayload & { exp: number }>(token);
      if (!payload?.sub || !payload?.jti || typeof payload.exp !== 'number') {
        next(refusal(ApiErrorCode.UNAUTHORIZED, 'Token không hợp lệ'));
        return;
      }
      const data = socket.data as MeetingSocketData;
      data.userId = payload.sub;
      data.tokenExp = payload.exp;
      next();
    } catch (error) {
      const expired = (error as { name?: string }).name === 'TokenExpiredError';
      next(
        expired
          ? refusal(ApiErrorCode.TOKEN_EXPIRED, 'Access token đã hết hạn')
          : refusal(ApiErrorCode.UNAUTHORIZED, 'Token không hợp lệ'),
      );
    }
  };
}
