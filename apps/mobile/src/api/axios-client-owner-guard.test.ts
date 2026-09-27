import type { InternalAxiosRequestConfig } from 'axios';
import { apiClient, OwnerMismatchError } from './axios-client';
import { tokenSubject } from './token-subject';
import { useSessionStore } from '../store/session.store';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));

/** A JWT-shaped token (unsigned — the client never verifies, the server does). */
const tokenFor = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub, jti: 'x' })).toString('base64url')}.sig`;

describe('owner guard on requests carrying queued data', () => {
  const sent: InternalAxiosRequestConfig[] = [];
  beforeAll(() => {
    // Real axios + interceptors; only the transport is replaced.
    apiClient.defaults.adapter = async (config) => {
      sent.push(config);
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    };
  });
  beforeEach(() => {
    sent.length = 0;
  });

  it("refuses, before anything leaves the device, to send one user's data with another user's token", async () => {
    useSessionStore.setState({ accessToken: tokenFor('user-b') });
    await expect(apiClient.post('/meetings', {}, { expectedOwnerId: 'user-a' })).rejects.toBeInstanceOf(OwnerMismatchError);
    expect(sent).toHaveLength(0);
  });

  it('sends when the token belongs to the owner, with that token', async () => {
    useSessionStore.setState({ accessToken: tokenFor('user-a') });
    await apiClient.post('/meetings', {}, { expectedOwnerId: 'user-a' });
    expect(sent).toHaveLength(1);
    expect(sent[0].headers.get('Authorization')).toBe(`Bearer ${tokenFor('user-a')}`);
  });

  it('refuses when signed out', async () => {
    useSessionStore.setState({ accessToken: null });
    await expect(apiClient.post('/meetings', {}, { expectedOwnerId: 'user-a' })).rejects.toBeInstanceOf(OwnerMismatchError);
  });

  it('leaves ordinary requests alone', async () => {
    useSessionStore.setState({ accessToken: tokenFor('user-b') });
    await apiClient.get('/meetings');
    expect(sent).toHaveLength(1);
  });

  it('tokenSubject reads base64url payloads and rejects garbage', () => {
    expect(tokenSubject(tokenFor('ả-ÿ_user'))).toBe('ả-ÿ_user');
    expect(tokenSubject('not-a-jwt')).toBeNull();
    expect(tokenSubject('a.%%%.b')).toBeNull();
    expect(tokenSubject(null)).toBeNull();
  });
});
