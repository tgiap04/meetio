import { performance } from 'node:perf_hooks';
import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { User, RefreshToken } from '../database/entities/index.js';

/**
 * `login()`'s three failure branches — unknown email, wrong password, and a
 * Google-only account — must be indistinguishable from outside: same code,
 * same message, same argon2 cost (decisions.md §16, phase-02 AC #5/#6). This
 * file is split out from `auth.service.spec.ts` because that symmetry is one
 * coherent unit worth reading on its own, not an arbitrary line-count cut.
 */

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

describe('AuthService — login failure symmetry (phase 02)', () => {
  let users: ReturnType<typeof createUsersRepoMock>;
  let service: AuthService;

  beforeEach(() => {
    users = createUsersRepoMock();
    const refreshTokens = createRefreshTokensRepoMock();
    const jwtService = new JwtService({ secret: 'test-secret' });
    service = new AuthService(users as never, refreshTokens as never, jwtService);
  });

  it('returns the exact same code and message across unknown email, wrong password, and a Google-only account', async () => {
    const hash = await argon2.hash('correct-password', { type: argon2.argon2id });

    users.findOne.mockResolvedValueOnce(null);
    const unknownEmailError = (await service
      .login({ email: 'nobody@example.com', password: 'x' } as LoginDto)
      .catch((e: unknown) => e)) as UnauthorizedException;

    users.findOne.mockResolvedValueOnce(fakeUser({ password_hash: hash }));
    const wrongPasswordError = (await service
      .login({ email: 'a@example.com', password: 'wrong' } as LoginDto)
      .catch((e: unknown) => e)) as UnauthorizedException;

    users.findOne.mockResolvedValueOnce(fakeUser({ password_hash: null, google_sub: 'google-sub-1' }));
    const googleOnlyError = (await service
      .login({ email: 'a@example.com', password: 'anything' } as LoginDto)
      .catch((e: unknown) => e)) as UnauthorizedException;

    expect(unknownEmailError).toBeInstanceOf(UnauthorizedException);
    expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
    expect(googleOnlyError).toBeInstanceOf(UnauthorizedException);
    expect(unknownEmailError.getResponse()).toEqual(wrongPasswordError.getResponse());
    expect(wrongPasswordError.getResponse()).toEqual(googleOnlyError.getResponse());
  });

  it('pays a comparable argon2 cost for a Google-only account as for a wrong password (timing symmetry)', async () => {
    const hash = await argon2.hash('correct-password', { type: argon2.argon2id });

    users.findOne.mockResolvedValueOnce(fakeUser({ password_hash: hash }));
    const wrongPasswordStart = performance.now();
    await service.login({ email: 'a@example.com', password: 'wrong' } as LoginDto).catch(() => undefined);
    const wrongPasswordElapsedMs = performance.now() - wrongPasswordStart;

    users.findOne.mockResolvedValueOnce(fakeUser({ password_hash: null, google_sub: 'google-sub-1' }));
    const googleOnlyStart = performance.now();
    await service.login({ email: 'a@example.com', password: 'anything' } as LoginDto).catch(() => undefined);
    const googleOnlyElapsedMs = performance.now() - googleOnlyStart;

    // eslint-disable-next-line no-console
    console.log(
      `login() timing — wrong password: ${wrongPasswordElapsedMs.toFixed(2)}ms, google-only: ${googleOnlyElapsedMs.toFixed(2)}ms`,
    );

    // Threshold is not fragile: the real gap when the Google-only branch
    // skips argon2 entirely is two orders of magnitude (~100ms vs <1ms),
    // not a few percent (decisions.md §16 / phase-02 AC #6).
    expect(googleOnlyElapsedMs).toBeGreaterThan(0.5 * wrongPasswordElapsedMs);
  });
});
