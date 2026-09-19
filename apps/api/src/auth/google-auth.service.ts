import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ApiErrorCode, type AuthTokenPair } from '@meetio/shared';
import { User } from '../database/entities/index.js';
import { AuthService } from './auth.service.js';
import { GoogleTokenVerifier } from './google-token-verifier.js';
import type { GoogleIdentityClaims } from './google-identity.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Three-branch lookup + auto-link + first-time creation for Google sign-in.
 * Kept out of `AuthService` — see decisions.md §5 (file size + ownership).
 *
 * Every branch ends by calling `AuthService.issueTokenPairWithUser`, the
 * exact method `register()`/`login()` call, so a Google-originated session
 * gets identical rotation, family revocation, and TTLs (decisions.md §5, §Bảo mật.5).
 */
@Injectable()
export class GoogleAuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly verifier: GoogleTokenVerifier,
    private readonly authService: AuthService,
  ) {}

  async signIn(idToken: string): Promise<AuthTokenPair> {
    if (!this.verifier.isConfigured()) {
      // Server misconfiguration, not a client error — decisions.md §7 chose
      // a boot-time WARN log over refusing to boot, so this is where the
      // "we forgot to configure it" fact actually surfaces at request time.
      throw new InternalServerErrorException({
        code: ApiErrorCode.INTERNAL_ERROR,
        message: 'Đăng nhập Google chưa được cấu hình trên máy chủ',
      });
    }

    // The email_verified gate lives inside verifier.verify() (via
    // toGoogleIdentity) and runs before ANY of the lookups below — an
    // unverified token never touches the `users` table (phase-03 §Bảo mật.3).
    const claims = await this.verifier.verify(idToken);

    const byGoogleSub = await this.users.findOne({ where: { google_sub: claims.sub } });
    if (byGoogleSub) {
      this.rejectIfDeleted(byGoogleSub);
      return this.authService.issueTokenPairWithUser(byGoogleSub);
    }

    // Deliberately NOT filtered by deleted_at — a soft-deleted account must
    // still be found here so it can be rejected instead of silently letting
    // a new account form under the same (UNIQUE) email (decisions.md §4).
    const byEmail = await this.users.findOne({ where: { email: claims.email } });
    if (byEmail) {
      this.rejectIfDeleted(byEmail);
      return this.linkGoogleSub(byEmail, claims);
    }

    return this.createGoogleUser(claims);
  }

  private rejectIfDeleted(user: User): void {
    if (user.deleted_at) {
      throw new UnauthorizedException({
        code: ApiErrorCode.UNAUTHORIZED,
        message: 'Tài khoản đã bị xóa',
      });
    }
  }

  /** Sets `google_sub` on an existing password account. `password_hash` is
   * left untouched — linking never revokes the password login path. */
  private async linkGoogleSub(user: User, claims: GoogleIdentityClaims): Promise<AuthTokenPair> {
    user.google_sub = claims.sub;
    try {
      const saved = await this.users.save(user);
      return this.authService.issueTokenPairWithUser(saved);
    } catch (error) {
      const winner = await this.recoverFromUniqueViolation(error, claims);
      return this.authService.issueTokenPairWithUser(winner);
    }
  }

  private async createGoogleUser(claims: GoogleIdentityClaims): Promise<AuthTokenPair> {
    const user = this.users.create({
      email: claims.email,
      google_sub: claims.sub,
      password_hash: null,
      display_name: claims.display_name,
      retention_days: null,
      recording_consent_at: null,
      monthly_token_budget: null,
      notification_settings: {},
    });
    try {
      const saved = await this.users.save(user);
      return this.authService.issueTokenPairWithUser(saved);
    } catch (error) {
      const winner = await this.recoverFromUniqueViolation(error, claims);
      return this.authService.issueTokenPairWithUser(winner);
    }
  }

  /** Two concurrent first-time Google sign-ins for the same claims race the
   * UNIQUE index on `google_sub` (or `email`, in the link branch). Re-read
   * what the other request just committed instead of surfacing a 500
   * (decisions.md §1, phase-03 AC #13). Any other error is rethrown as-is. */
  private async recoverFromUniqueViolation(error: unknown, claims: GoogleIdentityClaims): Promise<User> {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const winner =
      (await this.users.findOne({ where: { google_sub: claims.sub } })) ??
      (await this.users.findOne({ where: { email: claims.email } }));

    if (!winner) {
      throw error;
    }

    this.rejectIfDeleted(winner);
    return winner;
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = (error as QueryFailedError & { driverError?: { code?: string } }).driverError;
  return driverError?.code === POSTGRES_UNIQUE_VIOLATION;
}
