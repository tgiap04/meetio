import type {
  AuthTokenPair,
  LoginRequest,
  LogoutRequest,
  RefreshTokenRequest,
  RefreshTokenResponse,
  RegisterRequest,
} from '@meetio/shared';
import { apiClient } from './axios-client';

/**
 * `/auth/*` calls per docs/api-spec.md §1. Types come straight from
 * `@meetio/shared` — nothing here redeclares the wire shape.
 *
 * These endpoints do not exist yet on `apps/api` (Phase 03 builds them). The
 * calls below are correct against the documented contract; they are exercised
 * in tests against a mocked axios adapter, not a live server.
 */

export async function register(body: RegisterRequest): Promise<AuthTokenPair> {
  const { data } = await apiClient.post<AuthTokenPair>('/auth/register', body);
  return data;
}

export async function login(body: LoginRequest): Promise<AuthTokenPair> {
  const { data } = await apiClient.post<AuthTokenPair>('/auth/login', body);
  return data;
}

export async function refresh(body: RefreshTokenRequest): Promise<RefreshTokenResponse> {
  const { data } = await apiClient.post<RefreshTokenResponse>('/auth/refresh', body);
  return data;
}

export async function logout(body: LogoutRequest = {}): Promise<void> {
  await apiClient.post('/auth/logout', body);
}
