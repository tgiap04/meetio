import { jest } from '@jest/globals';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { IsNull } from 'typeorm';
import { AuthService } from './auth.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { User, RefreshToken } from '../database/entities/index.js';

function createUsersRepoMock() {
  return {
    findOne: jest.fn(async (): Promise<User | null> => null),
    create: jest.fn((data: unknown) => data),
    save: jest.fn(
      async (entity: unknown) =>
        ({
          id: 'user-1',
          created_at: new Date(),
          updated_at: new Date(),
          ...(entity as object),
        }) as User,
    ),
  };
}

function createRefreshTokensRepoMock() {
  return {
    findOne: jest.fn(async (): Promise<RefreshToken | null> => null),
    create: jest.fn((data: unknown) => data),
    save: jest.fn(async (entity: unknown) => entity as RefreshToken),
    update: jest.fn(async () => ({ affected: 1, raw: [] as unknown[], generatedMaps: [] })),
  };
}

/** Builds a full `User` shape from a partial override so each test only
 * states the fields it cares about. */
function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'a@example.com',
    password_hash: '',
    google_sub: null,
    display_name: 'A',
    retention_days: null,
    recording_consent_at: null,
    monthly_token_budget: null,
    notification_settings: {},
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  } as User;
}

function fakeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'rt-1',
    user_id: 'user-1',
    token_hash: 'hash',
    family_id: 'family-1',
    expires_at: new Date(Date.now() + 1000 * 60 * 60),
    revoked_at: null,
    device_label: null,
    created_at: new Date(),
    ...overrides,
  } as RefreshToken;
}

describe('AuthService', () => {
  let users: ReturnType<typeof createUsersRepoMock>;
  let refreshTokens: ReturnType<typeof createRefreshTokensRepoMock>;
  let jwtService: JwtService;
  let service: AuthService;

  beforeEach(() => {
    users = createUsersRepoMock();
    refreshTokens = createRefreshTokensRepoMock();
    jwtService = new JwtService({ secret: 'test-secret' });
    service = new AuthService(users as never, refreshTokens as never, jwtService);
  });

  describe('register', () => {
    it('hashes the password with argon2id and returns a token pair without password_hash', async () => {
      users.findOne.mockResolvedValue(null);
      const dto: RegisterDto = { email: 'a@example.com', password: 'password123', display_name: 'A' };

      const result = await service.register(dto);

      expect(users.save).toHaveBeenCalled();
      const savedArg = users.save.mock.calls[0]?.[0] as unknown as { password_hash: string };
      expect(savedArg.password_hash).not.toBe(dto.password);
      expect(await argon2.verify(savedArg.password_hash, dto.password)).toBe(true);
      expect(result.user).not.toHaveProperty('password_hash');
      expect(result.access_token).toEqual(expect.any(String));
      expect(result.refresh_token).toEqual(expect.any(String));
    });

    it('rejects a duplicate email with 400 VALIDATION_ERROR', async () => {
      users.findOne.mockResolvedValue(fakeUser({ id: 'existing' }));

      await expect(
        service.register({ email: 'a@example.com', password: 'password123', display_name: 'A' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('returns the same error for a wrong password and a nonexistent email', async () => {
      const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
      users.findOne.mockResolvedValueOnce(fakeUser({ password_hash: hash }));
      const wrongPasswordError = (await service
        .login({ email: 'a@example.com', password: 'wrong' } as LoginDto)
        .catch((e: unknown) => e)) as UnauthorizedException;

      users.findOne.mockResolvedValueOnce(null);
      const noSuchUserError = (await service
        .login({ email: 'nobody@example.com', password: 'wrong' } as LoginDto)
        .catch((e: unknown) => e)) as UnauthorizedException;

      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect(noSuchUserError).toBeInstanceOf(UnauthorizedException);
      expect(wrongPasswordError.getResponse()).toEqual(noSuchUserError.getResponse());
    });

    it('excludes soft-deleted accounts from login', async () => {
      await service.login({ email: 'deleted@example.com', password: 'x' } as LoginDto).catch(() => undefined);
      expect(users.findOne).toHaveBeenCalledWith({
        where: { email: 'deleted@example.com', deleted_at: IsNull() },
      });
    });

    it('logs in successfully with the right password', async () => {
      const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
      users.findOne.mockResolvedValue(fakeUser({ password_hash: hash }));

      const result = await service.login({ email: 'a@example.com', password: 'correct-password' });

      expect(result.access_token).toEqual(expect.any(String));
    });
  });

  describe('refresh — rotation and theft detection', () => {
    it('rotates: revokes the old token and issues a new one in the same family', async () => {
      const rawToken = 'a'.repeat(40);
      refreshTokens.findOne.mockResolvedValueOnce(fakeRefreshToken());
      users.findOne.mockResolvedValueOnce(fakeUser());

      const result = await service.refresh(rawToken);

      expect(refreshTokens.update).toHaveBeenCalledWith({ id: 'rt-1' }, { revoked_at: expect.any(Date) });
      expect(refreshTokens.save).toHaveBeenCalledWith(
        expect.objectContaining({ family_id: 'family-1', user_id: 'user-1' }),
      );
      expect(result.refresh_token).not.toBe(rawToken);
    });

    it('revokes the whole family when a rotated (already-revoked) token is reused', async () => {
      refreshTokens.findOne.mockResolvedValueOnce(fakeRefreshToken({ revoked_at: new Date() }));

      await expect(service.refresh('stolen-token')).rejects.toThrow(UnauthorizedException);
      expect(refreshTokens.update).toHaveBeenCalledWith(
        { family_id: 'family-1', revoked_at: IsNull() },
        { revoked_at: expect.any(Date) },
      );
    });

    it('rejects an unknown refresh token', async () => {
      refreshTokens.findOne.mockResolvedValueOnce(null);
      await expect(service.refresh('unknown-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired refresh token', async () => {
      refreshTokens.findOne.mockResolvedValueOnce(fakeRefreshToken({ expires_at: new Date(Date.now() - 1000) }));
      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes only the caller-owned, still-active refresh token identified by jti', async () => {
      await service.logout('user-1', 'rt-1');
      expect(refreshTokens.update).toHaveBeenCalledWith(
        { id: 'rt-1', user_id: 'user-1', revoked_at: IsNull() },
        { revoked_at: expect.any(Date) },
      );
    });
  });
});
