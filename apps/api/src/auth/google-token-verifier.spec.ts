import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TokenPayload } from 'google-auth-library';
import { ApiErrorCode } from '@meetio/shared';
import { GoogleTokenVerifier } from './google-token-verifier.js';

function fakeConfig(audiences: string | undefined): ConfigService {
  return { get: jest.fn(() => audiences) } as unknown as ConfigService;
}

function fakePayload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    iss: 'https://accounts.google.com',
    sub: 'google-sub-1',
    aud: 'client-id-1',
    iat: 0,
    exp: 0,
    email: 'user@example.com',
    email_verified: true,
    name: 'User Name',
    ...overrides,
  } as TokenPayload;
}

describe('GoogleTokenVerifier', () => {
  describe('isConfigured', () => {
    it('is false when GOOGLE_OAUTH_AUDIENCES is empty', () => {
      const verifier = new GoogleTokenVerifier(fakeConfig(''), {} as never);
      expect(verifier.isConfigured()).toBe(false);
    });

    it('is false when GOOGLE_OAUTH_AUDIENCES is unset', () => {
      const verifier = new GoogleTokenVerifier(fakeConfig(undefined), {} as never);
      expect(verifier.isConfigured()).toBe(false);
    });

    it('is true when GOOGLE_OAUTH_AUDIENCES has at least one entry', () => {
      const verifier = new GoogleTokenVerifier(fakeConfig('id-1'), {} as never);
      expect(verifier.isConfigured()).toBe(true);
    });
  });

  describe('verify', () => {
    it('passes the comma-separated audiences as an array to verifyIdToken', async () => {
      const verifyIdToken = jest.fn(async () => ({ getPayload: () => fakePayload() }));
      const verifier = new GoogleTokenVerifier(fakeConfig(' id-1 , id-2 '), { verifyIdToken } as never);

      await verifier.verify('some-id-token');

      expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'some-id-token', audience: ['id-1', 'id-2'] });
    });

    it('resolves verified claims through toGoogleIdentity', async () => {
      const verifyIdToken = jest.fn(async () => ({ getPayload: () => fakePayload() }));
      const verifier = new GoogleTokenVerifier(fakeConfig('id-1'), { verifyIdToken } as never);

      const claims = await verifier.verify('some-id-token');

      expect(claims).toEqual({ sub: 'google-sub-1', email: 'user@example.com', display_name: 'User Name' });
    });

    it('never lets the underlying library message escape the envelope', async () => {
      const verifyIdToken = jest.fn(async () => {
        throw new Error('Wrong recipient, payload audience != requested audience');
      });
      const verifier = new GoogleTokenVerifier(fakeConfig('id-1'), { verifyIdToken } as never);

      expect.assertions(3);
      try {
        await verifier.verify('bad-token');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const response = (error as UnauthorizedException).getResponse() as { code: string; message: string };
        expect(response.code).toBe(ApiErrorCode.GOOGLE_TOKEN_INVALID);
        expect(response.message).not.toMatch(/aud|iss|Token used too late|Wrong recipient/i);
      }
    });

    it('rejects with GOOGLE_TOKEN_INVALID when the ticket has no payload', async () => {
      const verifyIdToken = jest.fn(async () => ({ getPayload: () => undefined }));
      const verifier = new GoogleTokenVerifier(fakeConfig('id-1'), { verifyIdToken } as never);

      await expect(verifier.verify('token-without-payload')).rejects.toThrow(UnauthorizedException);
    });
  });
});
