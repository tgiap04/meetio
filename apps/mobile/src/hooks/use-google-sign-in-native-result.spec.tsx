import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Native Google sign-in result handling tests — the five result branches
 * (cancelled, unavailable, error with/without code) and their error messages.
 * Split from use-google-sign-in.test.tsx per file size ceiling (200 lines).
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

async function flush() {
  for (let i = 0; i < 12; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('useGoogleSignIn — native result handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ accessToken: null, refreshToken: null, authStatus: 'unauthenticated' });
  });

  it('không sinh lỗi khi người dùng huỷ hộp thoại Google', async () => {
    mockSignInWithGoogleNative.mockResolvedValue({ status: 'cancelled' });
    renderHarness();

    await act(async () => {
      hookResult.start();
    });
    await flush();

    expect(hookResult.errorMessage).toBeNull();
    expect(hookResult.isPending).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('hiện lỗi riêng khi thiếu Google Play Services', async () => {
    mockSignInWithGoogleNative.mockResolvedValue({ status: 'unavailable' });
    renderHarness();

    await act(async () => {
      hookResult.start();
    });
    await flush();

    expect(hookResult.errorMessage).toBe(
      'Thiết bị này chưa cài Google Play Services, không thể đăng nhập bằng Google.',
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('hiện NATIVE_ERROR_MESSAGE với debug code khi native sign-in lỗi có code', async () => {
    mockSignInWithGoogleNative.mockResolvedValue({ status: 'error', code: 'UNKNOWN_ERROR' });
    renderHarness();

    await act(async () => {
      hookResult.start();
    });
    await flush();

    // __DEV__ is true in Jest, so the code is appended as a debug suffix
    expect(hookResult.errorMessage).toContain('Đăng nhập Google thất bại, vui lòng thử lại.');
    expect(hookResult.errorMessage).toContain('UNKNOWN_ERROR');
    expect(mockPost).not.toHaveBeenCalled();
    expect(hookResult.isPending).toBe(false);
  });

  it('hiện NATIVE_ERROR_MESSAGE khi native sign-in lỗi không có code', async () => {
    mockSignInWithGoogleNative.mockResolvedValue({ status: 'error' });
    renderHarness();

    await act(async () => {
      hookResult.start();
    });
    await flush();

    expect(hookResult.errorMessage).toBe('Đăng nhập Google thất bại, vui lòng thử lại.');
    expect(mockPost).not.toHaveBeenCalled();
  });
});
