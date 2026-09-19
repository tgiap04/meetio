import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthTokenPair, LoginRequest, RegisterRequest } from '@meetio/shared';
import { login as loginRequest, logout as logoutRequest, register as registerRequest } from '../api/auth';
import { clearTokens, writeTokens } from '../storage/secure-store';
import { useSessionStore } from '../store/session.store';

/**
 * Persists a fresh token pair to secure storage AND the session store. The
 * `user` object in `AuthTokenPair` is server data — it is deliberately
 * dropped here rather than cached in Zustand; screens read the profile via
 * `useMeQuery` (TanStack Query) instead.
 */
export async function persistSession(tokens: AuthTokenPair): Promise<void> {
  await writeTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
  useSessionStore.getState().setTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (body: LoginRequest) => loginRequest(body),
    onSuccess: persistSession,
  });
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (body: RegisterRequest) => registerRequest(body),
    onSuccess: persistSession,
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => logoutRequest(),
    onSettled: async () => {
      // Logout revokes the refresh token server-side; clear local state
      // regardless of whether the network call itself succeeded, so a user
      // is never stuck "logged in" locally against a revoked session.
      await clearTokens();
      useSessionStore.getState().clearTokens();
      queryClient.clear();
    },
  });
}
