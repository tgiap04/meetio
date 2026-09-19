import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Mock chỉ lớp bọc native (phase 08) và adapter axios — KHÔNG mock
 * `persistSession`: nó phải chạy thật (secure-store trong bộ nhớ của
 * `jest.setup.ts` + `useSessionStore` thật) để AC #4 có nghĩa.
 */
jest.mock('../auth/google-native-signin', () => ({
  signInWithGoogleNative: jest.fn(),
}));
jest.mock('../api/axios-client', () => ({
  apiClient: { post: jest.fn() },
}));

import { signInWithGoogleNative } from '../auth/google-native-signin';
import { apiClient } from '../api/axios-client';
import { useSessionStore } from '../store/session.store';
import { readTokens } from '../storage/secure-store';
import { useGoogleSignIn, type GoogleSignInState } from './use-google-sign-in';

const mockSignInWithGoogleNative = signInWithGoogleNative as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

let hookResult: GoogleSignInState;

function Harness() {
  hookResult = useGoogleSignIn();
  return null;
}

function renderHarness() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  act(() => {
    TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
}

/** Xả hết chuỗi promise nội bộ của `start()` (native → mutation → persistSession). */
async function flush() {
  for (let i = 0; i < 12; i++) {
    // eslint-disable-next-line no-await-in-loop -- cố tình xả từng vi-tác vụ một
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const tokenPair = {
  access_token: 'google-access-token',
  refresh_token: 'google-refresh-token',
  user: { id: 'u1', email: 'a@b.com', display_name: 'A' },
};

function axiosError(code: string) {
  return {
    isAxiosError: true,
    response: { status: 401, data: { error: { code, message: '', details: {} } } },
  };
}

describe('useGoogleSignIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ accessToken: null, refreshToken: null, authStatus: 'unauthenticated' });
  });

  it('POST /auth/google với đúng { id_token } và không gì khác', async () => {
    mockSignInWithGoogleNative.mockResolvedValue({ status: 'success', idToken: 'the-id-token' });
    mockPost.mockResolvedValue({ data: tokenPair });
    renderHarness();

    await act(async () => {
      hookResult.start();
    });
    await flush();

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/auth/google');
    expect(body).toEqual({ id_token: 'the-id-token' });
    expect(Object.keys(body)).toEqual(['id_token']);
  });

  it('dùng lại persistSession: token vào secure-store và vào session store', async () => {
    mockSignInWithGoogleNative.mockResolvedValue({ status: 'success', idToken: 'the-id-token' });
    mockPost.mockResolvedValue({ data: tokenPair });
    renderHarness();

    await act(async () => {
      hookResult.start();
    });
    await flush();

    expect(useSessionStore.getState().authStatus).toBe('authenticated');
    expect(useSessionStore.getState().accessToken).toBe('google-access-token');
    await expect(readTokens()).resolves.toEqual({
      accessToken: 'google-access-token',
      refreshToken: 'google-refresh-token',
    });
    expect(hookResult.errorMessage).toBeNull();
    expect(hookResult.isPending).toBe(false);
  });

  it('hiện câu hướng dẫn xác minh email khi máy chủ trả GOOGLE_EMAIL_UNVERIFIED', async () => {
    mockSignInWithGoogleNative.mockResolvedValue({ status: 'success', idToken: 'the-id-token' });
    mockPost.mockRejectedValue(axiosError('GOOGLE_EMAIL_UNVERIFIED'));
    renderHarness();

    await act(async () => {
      hookResult.start();
    });
    await flush();

    expect(hookResult.errorMessage).toBe(
      'Tài khoản Google này chưa xác minh email. Hãy xác minh email với Google rồi thử lại.',
    );
    expect(hookResult.isPending).toBe(false);
    expect(useSessionStore.getState().authStatus).toBe('unauthenticated');
  });

  it('bỏ qua start() thứ hai khi đang chạy — lớp bọc native chỉ gọi đúng 1 lần', async () => {
    let resolveNative!: (value: { status: 'cancelled' }) => void;
    mockSignInWithGoogleNative.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNative = resolve;
        }),
    );
    renderHarness();

    await act(async () => {
      hookResult.start();
      hookResult.start();
      hookResult.start();
    });

    expect(mockSignInWithGoogleNative).toHaveBeenCalledTimes(1);

    resolveNative({ status: 'cancelled' });
    await flush();

    expect(hookResult.isPending).toBe(false);
  });
});
