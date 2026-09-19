import { jest } from '@jest/globals';
import { UnauthorizedException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ApiErrorCode } from '@meetio/shared';
import { UsersService } from './users.service.js';
import type { UsageRecord } from '../database/entities/index.js';
import type { GoogleTokenVerifier } from '../auth/google-token-verifier.js';
import type { GoogleIdentityClaims } from '../auth/google-identity.js';
import { fakeUser, createUsersRepoMock, createGoogleVerifierMock } from './users.service.test-helpers.js';

function fakeClaims(overrides: Partial<GoogleIdentityClaims> = {}): GoogleIdentityClaims {
  return { sub: 'google-sub-1', email: 'a@example.com', display_name: 'A', ...overrides };
}

/** `createGoogleVerifierMock` (shared helper) has no `isConfigured` — every
 * other test here needs it to default to `true` (configured), and only the
 * one test below needs it `false`. Defined locally rather than in the
 * shared helper so that file stays untouched by this follow-up. */
function withConfigured(verifier: ReturnType<typeof createGoogleVerifierMock>, configured: boolean) {
  return Object.assign(verifier, { isConfigured: jest.fn(() => configured) });
}

describe('UsersService.deleteMe', () => {
  let users: ReturnType<typeof createUsersRepoMock>;
  let googleVerifier: ReturnType<typeof createGoogleVerifierMock> & { isConfigured: () => boolean };
  let service: UsersService;

  beforeEach(() => {
    users = createUsersRepoMock();
    googleVerifier = withConfigured(createGoogleVerifierMock(), true);
    const usage = { find: jest.fn(async (): Promise<Pick<UsageRecord, 'input_tokens' | 'output_tokens'>[]> => []) };
    service = new UsersService(users as never, usage as never, googleVerifier as unknown as GoogleTokenVerifier);
  });

  it('sets deleted_at after verifying the password', async () => {
    const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
    users.findOne.mockResolvedValue(fakeUser({ password_hash: hash }));

    await service.deleteMe('user-1', { password: 'correct-password' });

    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(Date) }));
  });

  it('rejects deletion with the wrong password and does not touch deleted_at', async () => {
    const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
    users.findOne.mockResolvedValue(fakeUser({ password_hash: hash }));

    await expect(service.deleteMe('user-1', { password: 'wrong-password' })).rejects.toThrow(UnauthorizedException);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('rejects deletion for a Google-only account missing google_id_token with a distinct, honest error', async () => {
    users.findOne.mockResolvedValue(fakeUser({ password_hash: null, google_sub: 'google-sub-1' }));

    const error = (await service.deleteMe('user-1', {}).catch((e: unknown) => e)) as BadRequestException;

    expect(error).toBeInstanceOf(BadRequestException);
    const response = error.getResponse() as { code: string; details: Record<string, string[]> };
    expect(response.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(response.details.google_id_token).toEqual(['required_for_google_account']);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('rejects a request carrying neither credential as a validation error', async () => {
    users.findOne.mockResolvedValue(fakeUser({ password_hash: await argon2.hash('x', { type: argon2.argon2id }) }));

    const error = (await service.deleteMe('user-1', {}).catch((e: unknown) => e)) as BadRequestException;

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error.getResponse() as { code: string }).code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('rejects a request carrying both credentials at once instead of silently preferring one', async () => {
    const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
    users.findOne.mockResolvedValue(fakeUser({ password_hash: hash }));

    const error = (await service
      .deleteMe('user-1', { password: 'correct-password', google_id_token: 'some-token' })
      .catch((e: unknown) => e)) as BadRequestException;

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error.getResponse() as { code: string }).code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(googleVerifier.verify).not.toHaveBeenCalled();
    expect(users.save).not.toHaveBeenCalled();
  });

  it('deletes a Google-only account when the verified token sub matches users.google_sub', async () => {
    users.findOne.mockResolvedValue(fakeUser({ password_hash: null, google_sub: 'google-sub-1' }));
    googleVerifier.verify.mockResolvedValue(fakeClaims({ sub: 'google-sub-1' }));

    await service.deleteMe('user-1', { google_id_token: 'a-valid-token' });

    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(Date) }));
  });

  it('rejects deletion when a verified Google token belongs to a DIFFERENT account (sub mismatch)', async () => {
    users.findOne.mockResolvedValue(fakeUser({ password_hash: null, google_sub: 'google-sub-1' }));
    googleVerifier.verify.mockResolvedValue(fakeClaims({ sub: 'someone-elses-sub' }));

    await expect(service.deleteMe('user-1', { google_id_token: 'someone-elses-valid-token' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(users.save).not.toHaveBeenCalled();
  });

  it('never trusts the token email over sub — same email, different sub is still rejected', async () => {
    users.findOne.mockResolvedValue(fakeUser({ password_hash: null, google_sub: 'google-sub-1', email: 'a@example.com' }));
    googleVerifier.verify.mockResolvedValue(fakeClaims({ sub: 'someone-elses-sub', email: 'a@example.com' }));

    await expect(service.deleteMe('user-1', { google_id_token: 'token-with-matching-email' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(users.save).not.toHaveBeenCalled();
  });

  it('keeps a linked account (password_hash AND google_sub) on the password branch, ignoring the Google option', async () => {
    const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
    users.findOne.mockResolvedValue(fakeUser({ password_hash: hash, google_sub: 'google-sub-1' }));

    await service.deleteMe('user-1', { password: 'correct-password' });

    expect(googleVerifier.verify).not.toHaveBeenCalled();
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(Date) }));
  });

  it('rejects a linked account (has password_hash) when only a google_id_token is sent', async () => {
    const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
    users.findOne.mockResolvedValue(fakeUser({ password_hash: hash, google_sub: 'google-sub-1' }));

    const error = (await service
      .deleteMe('user-1', { google_id_token: 'a-valid-token' })
      .catch((e: unknown) => e)) as BadRequestException;

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error.getResponse() as { code: string }).code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(googleVerifier.verify).not.toHaveBeenCalled();
    expect(users.save).not.toHaveBeenCalled();
  });

  it('reports a configuration error, not a token error, when Google sign-in is not configured', async () => {
    users.findOne.mockResolvedValue(fakeUser({ password_hash: null, google_sub: 'google-sub-1' }));
    withConfigured(googleVerifier, false);

    const error = (await service
      .deleteMe('user-1', { google_id_token: 'a-token-that-is-never-checked' })
      .catch((e: unknown) => e)) as InternalServerErrorException;

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error.getResponse() as { code: string }).code).toBe(ApiErrorCode.INTERNAL_ERROR);
    expect(googleVerifier.verify).not.toHaveBeenCalled();
    expect(users.save).not.toHaveBeenCalled();
  });
});
