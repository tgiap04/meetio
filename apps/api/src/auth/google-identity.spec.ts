import { UnauthorizedException } from '@nestjs/common';
import type { TokenPayload } from 'google-auth-library';
import { ApiErrorCode } from '@meetio/shared';
import { toGoogleIdentity } from './google-identity.js';

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

function errorCode(error: unknown): unknown {
  return (error as UnauthorizedException).getResponse();
}

describe('toGoogleIdentity', () => {
  it('accepts a fully verified payload and derives display_name from name', () => {
    const result = toGoogleIdentity(fakePayload());
    expect(result).toEqual({ sub: 'google-sub-1', email: 'user@example.com', display_name: 'User Name' });
  });

  it('falls back to the email local part when name is absent', () => {
    const result = toGoogleIdentity(fakePayload({ name: undefined }));
    expect(result.display_name).toBe('user');
  });

  it('rejects email_verified: false with GOOGLE_EMAIL_UNVERIFIED', () => {
    expect.assertions(2);
    try {
      toGoogleIdentity(fakePayload({ email_verified: false }));
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(errorCode(error)).toMatchObject({ code: ApiErrorCode.GOOGLE_EMAIL_UNVERIFIED });
    }
  });

  it('rejects email_verified: undefined with GOOGLE_TOKEN_INVALID (not GOOGLE_EMAIL_UNVERIFIED)', () => {
    expect.assertions(2);
    try {
      toGoogleIdentity(fakePayload({ email_verified: undefined }));
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(errorCode(error)).toMatchObject({ code: ApiErrorCode.GOOGLE_TOKEN_INVALID });
    }
  });

  it('rejects a missing sub with GOOGLE_TOKEN_INVALID', () => {
    expect.assertions(1);
    try {
      toGoogleIdentity(fakePayload({ sub: '' }));
    } catch (error) {
      expect(errorCode(error)).toMatchObject({ code: ApiErrorCode.GOOGLE_TOKEN_INVALID });
    }
  });

  it('rejects a missing email with GOOGLE_TOKEN_INVALID', () => {
    expect.assertions(1);
    try {
      toGoogleIdentity(fakePayload({ email: undefined }));
    } catch (error) {
      expect(errorCode(error)).toMatchObject({ code: ApiErrorCode.GOOGLE_TOKEN_INVALID });
    }
  });

  it('never leaks a partial claim set — email_verified gate runs before sub/email checks', () => {
    // A payload that fails both the verified gate AND is missing sub/email
    // must still resolve to the unverified-email code, proving the gate is
    // checked first (phase-03 §Bảo mật: it must stand before everything).
    expect.assertions(1);
    try {
      toGoogleIdentity(fakePayload({ email_verified: false, sub: '', email: undefined }));
    } catch (error) {
      expect(errorCode(error)).toMatchObject({ code: ApiErrorCode.GOOGLE_EMAIL_UNVERIFIED });
    }
  });
});
