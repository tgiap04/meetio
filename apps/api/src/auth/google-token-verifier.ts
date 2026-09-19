import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { ApiErrorCode } from '@meetio/shared';
import { toGoogleIdentity, type GoogleIdentityClaims } from './google-identity.js';

/**
 * Verifies a Google ID token against Google's JWKS and turns the result into
 * `GoogleIdentityClaims`.
 *
 * `client` is `@Optional()` so Nest can build this with only `ConfigService`
 * in production (falling back to a real `OAuth2Client`), while tests inject a
 * fake client and never touch the network (phase-03 §Nhận định then chốt).
 */
@Injectable()
export class GoogleTokenVerifier {
  private readonly audiences: string[];
  private readonly client: OAuth2Client;

  constructor(config: ConfigService, @Optional() client?: OAuth2Client) {
    this.audiences = parseAudiences(config.get<string>('GOOGLE_OAUTH_AUDIENCES'));
    this.client = client ?? new OAuth2Client();
  }

  isConfigured(): boolean {
    return this.audiences.length > 0;
  }

  /**
   * Verifies signature, `iss`, `aud` (against the configured audience list),
   * and `exp` via `verifyIdToken`, then gates and normalises the payload
   * through `toGoogleIdentity`.
   *
   * Every failure from the underlying library is swallowed and replaced with
   * our own `GOOGLE_TOKEN_INVALID` message — the library's own message names
   * which claim failed (e.g. "Wrong recipient", "Token used too late"),
   * which is a small oracle we do not want to hand to a caller (AC #5).
   */
  async verify(idToken: string): Promise<GoogleIdentityClaims> {
    const payload = await this.verifyAgainstGoogle(idToken);
    return toGoogleIdentity(payload);
  }

  private async verifyAgainstGoogle(idToken: string) {
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.audiences });
      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('missing payload');
      }
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: ApiErrorCode.GOOGLE_TOKEN_INVALID,
        message: 'Google ID token không hợp lệ',
      });
    }
  }
}

/** `GOOGLE_OAUTH_AUDIENCES` is a comma-separated list of client IDs, trimmed
 * and stripped of empty entries — an unset/empty value yields `[]`, which is
 * exactly what `isConfigured()` reads as "not configured" (decisions §7). */
function parseAudiences(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
