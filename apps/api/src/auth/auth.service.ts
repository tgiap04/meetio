import { randomUUID, createHash } from 'node:crypto';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { IsNull, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { ApiErrorCode, type AuthTokenPair, type RefreshTokenResponse } from '@meetio/shared';
import { User, RefreshToken } from '../database/entities/index.js';
import { toPublicUser } from '../users/dto/public-user.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_MS, TIMING_SAFETY_PASSPHRASE } from './auth.constants.js';
import type { JwtPayload } from './jwt-payload.type.js';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

@Injectable()
export class AuthService {
  /** Hashed once at construction — see TIMING_SAFETY_PASSPHRASE. */
  private readonly timingSafetyHash: Promise<string>;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
  ) {
    this.timingSafetyHash = argon2.hash(TIMING_SAFETY_PASSPHRASE, { type: argon2.argon2id });
  }

  async register(dto: RegisterDto): Promise<AuthTokenPair> {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Email đã được sử dụng',
        details: { email: ['already_registered'] },
      });
    }

    const password_hash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.users.save(
      this.users.create({
        email: dto.email,
        password_hash,
        display_name: dto.display_name,
        retention_days: null,
        recording_consent_at: null,
        monthly_token_budget: null,
        notification_settings: {},
      }),
    );

    return this.issueTokenPairWithUser(user);
  }

  async login(dto: LoginDto): Promise<AuthTokenPair> {
    const user = await this.users.findOne({ where: { email: dto.email, deleted_at: IsNull() } });

    if (!user) {
      await this.burnTimingSafetyCost(dto.password);
      throw this.invalidCredentials();
    }

    if (!user.password_hash) {
      // Google-only account: pay the same argon2 cost as every other failure
      // branch below, or the login endpoint answers "does this email have a
      // password?" through timing alone (decisions.md §16).
      await this.burnTimingSafetyCost(dto.password);
      throw this.invalidCredentials();
    }

    const passwordOk = await argon2.verify(user.password_hash, dto.password).catch(() => false);
    if (!passwordOk) {
      throw this.invalidCredentials();
    }

    return this.issueTokenPairWithUser(user);
  }

  /** Burns the same argon2 verify cost a real password check would pay, so
   * response timing cannot distinguish "no such email", "wrong password", and
   * "Google-only account" from one another (decisions.md §16). */
  private async burnTimingSafetyCost(password: string): Promise<void> {
    await argon2.verify(await this.timingSafetyHash, password).catch(() => false);
  }

  async refresh(rawRefreshToken: string): Promise<RefreshTokenResponse> {
    const tokenHash = hashToken(rawRefreshToken);
    const existing = await this.refreshTokens.findOne({ where: { token_hash: tokenHash } });

    if (!existing) {
      throw this.invalidRefreshToken();
    }

    if (existing.revoked_at) {
      // Theft signal: a token we already rotated away from came back. Kill
      // the whole chain — the legitimate holder will simply be forced to
      // log in again, which is the correct outcome for a compromised device.
      await this.refreshTokens.update(
        { family_id: existing.family_id, revoked_at: IsNull() },
        { revoked_at: new Date() },
      );
      throw this.invalidRefreshToken();
    }

    if (existing.expires_at.getTime() < Date.now()) {
      throw this.invalidRefreshToken();
    }

    const user = await this.users.findOne({ where: { id: existing.user_id, deleted_at: IsNull() } });
    if (!user) {
      throw this.invalidRefreshToken();
    }

    await this.refreshTokens.update({ id: existing.id }, { revoked_at: new Date() });
    const rotated = await this.createRefreshToken(user.id, existing.family_id);
    const access_token = this.signAccessToken(user.id, rotated.id);

    return { access_token, refresh_token: rotated.rawToken };
  }

  /** No request body (api-spec §1) — `jti` from the caller's own access token
   * identifies exactly the refresh token bound to this session. */
  async logout(userId: string, jti: string): Promise<void> {
    await this.refreshTokens.update({ id: jti, user_id: userId, revoked_at: IsNull() }, { revoked_at: new Date() });
  }

  /** The single source for every `login()` failure response. Unknown email,
   * wrong password, and a Google-only account all return this exact object —
   * splitting the message per branch would resurrect the account-enumeration
   * oracle this method exists to close (decisions.md §16). */
  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: ApiErrorCode.UNAUTHORIZED,
      message: 'Email hoặc mật khẩu không đúng',
    });
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: ApiErrorCode.UNAUTHORIZED,
      message: 'Refresh token không hợp lệ hoặc đã bị thu hồi',
    });
  }

  /** Public seam consumed by `GoogleAuthService` (phase 03): every login path
   * — password or Google — issues tokens through this exact method, so
   * rotation, family revocation, and TTLs never diverge into a second
   * parallel token-issuing path. */
  public async issueTokenPairWithUser(user: User): Promise<AuthTokenPair> {
    const refreshToken = await this.createRefreshToken(user.id);
    const access_token = this.signAccessToken(user.id, refreshToken.id);
    return { access_token, refresh_token: refreshToken.rawToken, user: toPublicUser(user) };
  }

  private signAccessToken(userId: string, jti: string): string {
    const payload: JwtPayload = { sub: userId, jti };
    return this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }

  private async createRefreshToken(
    userId: string,
    familyId?: string,
  ): Promise<{ id: string; rawToken: string }> {
    const id = randomUUID();
    const rawToken = randomUUID() + randomUUID();
    const saved = await this.refreshTokens.save(
      this.refreshTokens.create({
        id,
        user_id: userId,
        token_hash: hashToken(rawToken),
        family_id: familyId ?? id,
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revoked_at: null,
        device_label: null,
      }),
    );
    return { id: saved.id, rawToken };
  }
}
