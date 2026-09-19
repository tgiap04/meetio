import { jest } from '@jest/globals';
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { QueryFailedError } from 'typeorm';
import { AuthService } from './auth.service.js';
import { GoogleAuthService } from './google-auth.service.js';
import { GoogleTokenVerifier } from './google-token-verifier.js';
import type { GoogleIdentityClaims } from './google-identity.js';
import type { User, RefreshToken } from '../database/entities/index.js';

// Same shape as auth.service.spec.ts's mocks, copied rather than imported —
// phase-03's implementation steps say copy the mold, not cross-import spec files.
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

function fakeClaims(overrides: Partial<GoogleIdentityClaims> = {}): GoogleIdentityClaims {
  return { sub: 'google-sub-1', email: 'a@example.com', display_name: 'A', ...overrides };
}

function fakeVerifier(claims: GoogleIdentityClaims, isConfigured = true): GoogleTokenVerifier {
  return {
    isConfigured: jest.fn(() => isConfigured),
    verify: jest.fn(async () => claims),
  } as unknown as GoogleTokenVerifier;
}

describe('GoogleAuthService', () => {
  let users: ReturnType<typeof createUsersRepoMock>;
  let authService: AuthService;

  beforeEach(() => {
    users = createUsersRepoMock();
    const refreshTokens = createRefreshTokensRepoMock();
    authService = new AuthService(users as never, refreshTokens as never, new JwtService({ secret: 'test-secret' }));
  });

  it('throws INTERNAL_ERROR when the verifier is not configured, without calling verify', async () => {
    const verifier = fakeVerifier(fakeClaims(), false);
    const service = new GoogleAuthService(users as never, verifier, authService);

    await expect(service.signIn('any-token')).rejects.toThrow(InternalServerErrorException);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('logs in by google_sub even when the stored email differs from the claims email (AC #8)', async () => {
    const claims = fakeClaims({ sub: 'sub-match', email: 'claims-email@example.com' });
    const verifier = fakeVerifier(claims);
    users.findOne.mockResolvedValueOnce(fakeUser({ google_sub: 'sub-match', email: 'stored-different@example.com' }));

    const service = new GoogleAuthService(users as never, verifier, authService);
    const result = await service.signIn('id-token');

    expect(users.findOne).toHaveBeenNthCalledWith(1, { where: { google_sub: 'sub-match' } });
    expect(result.user.email).toBe('stored-different@example.com');
  });

  it('auto-links google_sub to a matching password account and keeps password_hash (AC #9)', async () => {
    const claims = fakeClaims({ sub: 'new-sub', email: 'a@example.com' });
    const verifier = fakeVerifier(claims);
    users.findOne
      .mockResolvedValueOnce(null) // by google_sub — not found
      .mockResolvedValueOnce(fakeUser({ email: 'a@example.com', password_hash: 'existing-hash', google_sub: null }));

    const service = new GoogleAuthService(users as never, verifier, authService);
    await service.signIn('id-token');

    const saved = users.save.mock.calls[0]?.[0] as unknown as { google_sub: string; password_hash: string };
    expect(saved.google_sub).toBe('new-sub');
    expect(saved.password_hash).toBe('existing-hash');
  });

  it('creates a new account with password_hash null when nothing matches (AC #10)', async () => {
    const claims = fakeClaims({ sub: 'brand-new-sub', email: 'brand-new@example.com' });
    const verifier = fakeVerifier(claims);
    users.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const service = new GoogleAuthService(users as never, verifier, authService);
    await service.signIn('id-token');

    const created = users.create.mock.calls[0]?.[0] as unknown as { password_hash: string | null; google_sub: string };
    expect(created.password_hash).toBeNull();
    expect(created.google_sub).toBe('brand-new-sub');
  });

  it('rejects a soft-deleted account matched by google_sub', async () => {
    const verifier = fakeVerifier(fakeClaims());
    users.findOne.mockResolvedValueOnce(fakeUser({ google_sub: 'google-sub-1', deleted_at: new Date() }));

    const service = new GoogleAuthService(users as never, verifier, authService);
    await expect(service.signIn('id-token')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a soft-deleted account matched by email (AC #11)', async () => {
    const verifier = fakeVerifier(fakeClaims());
    users.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fakeUser({ email: 'a@example.com', deleted_at: new Date() }));

    const service = new GoogleAuthService(users as never, verifier, authService);
    await expect(service.signIn('id-token')).rejects.toThrow(UnauthorizedException);
  });

  it('never reads identity from the raw idToken string — only from verified claims (AC #12)', async () => {
    const claims = fakeClaims({ sub: 'claims-sub', email: 'claims-only@example.com' });
    const verifier = fakeVerifier(claims);
    users.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const service = new GoogleAuthService(users as never, verifier, authService);
    // The idToken string itself looks nothing like the claims — if the
    // service ever parsed it directly instead of trusting verify()'s output,
    // this would diverge from the assertions below.
    await service.signIn('totally-unrelated-opaque-string');

    expect(users.findOne).toHaveBeenNthCalledWith(1, { where: { google_sub: 'claims-sub' } });
    expect(users.findOne).toHaveBeenNthCalledWith(2, { where: { email: 'claims-only@example.com' } });
  });

  it('recovers from a concurrent unique-violation on create by re-reading the winning row (AC #13)', async () => {
    const claims = fakeClaims({ sub: 'racing-sub', email: 'racing@example.com' });
    const verifier = fakeVerifier(claims);
    const winner = fakeUser({ id: 'winner', google_sub: 'racing-sub', email: 'racing@example.com' });

    users.findOne
      .mockResolvedValueOnce(null) // by google_sub — not found
      .mockResolvedValueOnce(null) // by email — not found
      .mockResolvedValueOnce(winner); // re-read after the 23505 by google_sub
    users.save.mockRejectedValueOnce(new QueryFailedError('insert', [], { code: '23505' } as unknown as Error));

    const service = new GoogleAuthService(users as never, verifier, authService);
    const result = await service.signIn('id-token');

    expect(result.user.id).toBe('winner');
  });

  it('rethrows a non-unique-violation save error instead of swallowing it', async () => {
    const claims = fakeClaims();
    const verifier = fakeVerifier(claims);
    users.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    users.save.mockRejectedValueOnce(new Error('connection reset'));

    const service = new GoogleAuthService(users as never, verifier, authService);
    await expect(service.signIn('id-token')).rejects.toThrow('connection reset');
  });

  it('returns an AuthTokenPair shape with no password_hash on the user (AC #15)', async () => {
    const claims = fakeClaims();
    const verifier = fakeVerifier(claims);
    users.findOne.mockResolvedValueOnce(fakeUser({ google_sub: claims.sub }));

    const service = new GoogleAuthService(users as never, verifier, authService);
    const result = await service.signIn('id-token');

    expect(Object.keys(result).sort()).toEqual(['access_token', 'refresh_token', 'user']);
    expect(result.user).not.toHaveProperty('password_hash');
  });
});
