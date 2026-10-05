import type { InternalAxiosRequestConfig } from 'axios';
import { apiClient, OwnerMismatchError } from './axios-client';
import { transcribeAudioChunk } from './stt';
import { useSessionStore } from '../store/session.store';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));

/** A JWT-shaped token (unsigned — the client never verifies, the server does). */
const tokenFor = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub, jti: 'x' })).toString('base64url')}.sig`;

describe('audio chunk uploads respect the owner guard', () => {
  const sent: InternalAxiosRequestConfig[] = [];
  beforeAll(() => {
    // Real axios + interceptors; only the transport is replaced.
    apiClient.defaults.adapter = async (config) => {
      sent.push(config);
      return { data: { text: 'xin chào' }, status: 200, statusText: 'OK', headers: {}, config };
    };
  });
  beforeEach(() => {
    sent.length = 0;
  });

  it("never sends one user's audio with another user's token", async () => {
    useSessionStore.setState({ accessToken: tokenFor('user-b') });
    await expect(transcribeAudioChunk('file:///c.m4a', 'vi-VN', { ownerId: 'user-a', meetingId: 'm1' })).rejects.toBeInstanceOf(OwnerMismatchError);
    expect(sent).toHaveLength(0);
  });

  it('uploads for the signed-in owner', async () => {
    useSessionStore.setState({ accessToken: tokenFor('user-a') });
    await expect(transcribeAudioChunk('file:///c.m4a', 'vi-VN', { ownerId: 'user-a', meetingId: 'm1' })).resolves.toBe('xin chào');
    expect(sent).toHaveLength(1);
  });
});
