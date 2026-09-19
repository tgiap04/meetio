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

/** `POST /auth/google` — ID token lấy từ SDK Google trên máy.
 *  Máy chủ **không bao giờ** nhận email hay user id từ client; mọi sự thật
 *  về danh tính suy ra từ token đã xác minh (xem phase-03 §Bảo mật). */
export interface GoogleSignInRequest {
  id_token: string;
}
