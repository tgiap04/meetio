import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { ApiErrorCode, type GetMeResponse, type RecordConsentResponse } from '@meetio/shared';
import { CURRENT_CONSENT_VERSION, USAGE_WARNING_RATIO } from './consent.js';
import { User, UsageRecord } from '../database/entities/index.js';
import { GoogleTokenVerifier } from '../auth/google-token-verifier.js';
import { toPublicUser, type PublicUserDto } from './dto/public-user.dto.js';
import type { UpdateMeDto } from './dto/update-me.dto.js';
import { assertBooleanValues } from './dto/update-me.dto.js';
import type { DeleteMeDto } from './dto/delete-me.dto.js';
import { checkExactlyOneDeleteCredential } from './delete-credential.js';

function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UsageRecord) private readonly usageRecords: Repository<UsageRecord>,
    private readonly googleTokenVerifier: GoogleTokenVerifier,
  ) {}

  async getMe(userId: string): Promise<GetMeResponse> {
    const user = await this.findActiveUserOrFail(userId);
    const used = await this.sumCurrentMonthTokens(userId);
    const budget = user.monthly_token_budget === null ? null : Number(user.monthly_token_budget);
    const ratio = budget ? used / budget : null;
    return {
      user: toPublicUser(user),
      current_month_tokens_used: used,
      usage: {
        used,
        budget,
        percent: ratio === null ? null : Math.min(100, Math.round(ratio * 100)),
        warning: ratio !== null && ratio >= USAGE_WARNING_RATIO,
      },
    };
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<PublicUserDto> {
    const user = await this.findActiveUserOrFail(userId);

    if (dto.display_name !== undefined) {
      user.display_name = dto.display_name;
    }
    if (dto.retention_days !== undefined) {
      user.retention_days = dto.retention_days;
    }
    if (dto.notification_settings !== undefined) {
      try {
        assertBooleanValues(dto.notification_settings);
      } catch (error) {
        throw toValidationError(error);
      }
      user.notification_settings = dto.notification_settings;
    }

    const saved = await this.users.save(user);
    return toPublicUser(saved);
  }

  async recordConsent(userId: string): Promise<RecordConsentResponse> {
    const user = await this.findActiveUserOrFail(userId);
    user.recording_consent_at = new Date();
    user.consent_version = CURRENT_CONSENT_VERSION;
    const saved = await this.users.save(user);
    return { recording_consent_at: saved.recording_consent_at!.toISOString(), consent_version: CURRENT_CONSENT_VERSION };
  }

  /** Soft-deletes the account after a step-up credential check — hard delete
   * follows 30 days later via the scheduled job (jobs/account-deletion.job.ts).
   * Setting `deleted_at` here is what makes `AuthService.login` refuse this
   * account immediately (api-spec: "chặn đăng nhập ngay lập tức").
   *
   * Which credential is required is decided by the ACCOUNT's `password_hash`
   * (server-side truth), never by which field the caller chose to send — a
   * linked account (both `password_hash` and `google_sub` set) always stays
   * on the password branch (phase-12 "Other requirements"). */
  async deleteMe(userId: string, dto: DeleteMeDto): Promise<void> {
    checkExactlyOneDeleteCredential(dto);
    const user = await this.findActiveUserOrFail(userId);

    if (user.password_hash) {
      await this.verifyPasswordCredential(user.password_hash, dto.password);
    } else {
      await this.verifyGoogleCredential(user, dto.google_id_token);
    }

    user.deleted_at = new Date();
    await this.users.save(user);
  }

  private async verifyPasswordCredential(passwordHash: string, password: string | undefined): Promise<void> {
    if (password === undefined) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Cần mật khẩu để xóa tài khoản này',
        details: { password: ['required'] },
      });
    }

    const passwordOk = await argon2.verify(passwordHash, password).catch(() => false);
    if (!passwordOk) {
      throw new UnauthorizedException({
        code: ApiErrorCode.UNAUTHORIZED,
        message: 'Mật khẩu không đúng',
      });
    }
  }

  /**
   * `verify()` only proves Google signed this token for SOME account. The
   * `claims.sub === user.google_sub` check is what proves it is signed for
   * THIS account — skipping it would let any valid Google ID token delete
   * any Google-only account (phase-12 §Bảo mật, the load-bearing line).
   * Matched by `sub`, never by `claims.email` — email is not identity here.
   */
  private async verifyGoogleCredential(user: User, googleIdToken: string | undefined): Promise<void> {
    if (googleIdToken === undefined) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Tài khoản này đăng nhập bằng Google, cần google_id_token để xóa',
        details: { google_id_token: ['required_for_google_account'] },
      });
    }

    // Mirrors the same guard in `GoogleAuthService.signIn` — without it, an
    // unconfigured server (`GOOGLE_OAUTH_AUDIENCES` empty) makes `verify()`
    // fail with an empty audience list, and the catch below would relabel
    // that as "your token is invalid" when the true cause is "this server
    // has no Google configuration". That is a safe failure but a dishonest
    // one; this makes it honest instead.
    if (!this.googleTokenVerifier.isConfigured()) {
      throw new InternalServerErrorException({
        code: ApiErrorCode.INTERNAL_ERROR,
        message: 'Xóa tài khoản bằng Google chưa được cấu hình trên máy chủ',
      });
    }

    const claims = await this.googleTokenVerifier.verify(googleIdToken);
    if (claims.sub !== user.google_sub) {
      throw new UnauthorizedException({
        code: ApiErrorCode.UNAUTHORIZED,
        message: 'Tài khoản Google không khớp',
      });
    }
  }

  private async findActiveUserOrFail(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId, deleted_at: IsNull() } });
    if (!user) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Không tìm thấy người dùng' });
    }
    return user;
  }

  private async sumCurrentMonthTokens(userId: string): Promise<number> {
    const records = await this.usageRecords.find({
      where: { user_id: userId, created_at: MoreThanOrEqual(startOfCurrentMonthUtc()) },
      select: { input_tokens: true, output_tokens: true },
    });
    return records.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0);
  }
}

// Re-exported so `assertBooleanValues` failures still surface as 400
// VALIDATION_ERROR rather than an unhandled 500 — Nest's exception filter
// only knows HttpException; wrap the TypeError at the controller boundary.
export function toValidationError(error: unknown): BadRequestException {
  return new BadRequestException({
    code: ApiErrorCode.VALIDATION_ERROR,
    message: error instanceof Error ? error.message : 'Invalid request',
    details: {},
  });
}
