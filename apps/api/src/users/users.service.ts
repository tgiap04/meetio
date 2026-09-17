import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { ApiErrorCode, type GetMeResponse, type RecordConsentResponse } from '@meetio/shared';
import { User, UsageRecord } from '../database/entities/index.js';
import { toPublicUser, type PublicUserDto } from './dto/public-user.dto.js';
import type { UpdateMeDto } from './dto/update-me.dto.js';
import { assertBooleanValues } from './dto/update-me.dto.js';

function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UsageRecord) private readonly usageRecords: Repository<UsageRecord>,
  ) {}

  async getMe(userId: string): Promise<GetMeResponse> {
    const user = await this.findActiveUserOrFail(userId);
    const currentMonthTokensUsed = await this.sumCurrentMonthTokens(userId);
    return { user: toPublicUser(user), current_month_tokens_used: currentMonthTokensUsed };
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
    const saved = await this.users.save(user);
    return { recording_consent_at: saved.recording_consent_at!.toISOString() };
  }

  /** Soft-deletes the account after verifying the password — hard delete
   * follows 30 days later via the scheduled job (jobs/account-deletion.job.ts).
   * Setting `deleted_at` here is what makes `AuthService.login` refuse this
   * account immediately (api-spec: "chặn đăng nhập ngay lập tức"). */
  async deleteMe(userId: string, password: string): Promise<void> {
    const user = await this.findActiveUserOrFail(userId);

    const passwordOk = await argon2.verify(user.password_hash, password).catch(() => false);
    if (!passwordOk) {
      throw new UnauthorizedException({
        code: ApiErrorCode.UNAUTHORIZED,
        message: 'Mật khẩu không đúng',
      });
    }

    user.deleted_at = new Date();
    await this.users.save(user);
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
