import type { PublicUser } from './user.types';

/**
 * Auth endpoints request/response contracts.
 * Source of truth: docs/api-spec.md §1 (Xác thực).
 */

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokenPair {
  access_token: string;
  refresh_token: string;
  user: PublicUser;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

/** `/auth/refresh` rotates the refresh token; response omits `user`. */
export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
}

/** `/auth/logout` takes no body — it revokes the refresh token bound to the current session. */
export type LogoutRequest = Record<string, never>;
