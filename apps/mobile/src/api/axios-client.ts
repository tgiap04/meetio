import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorEnvelope, RefreshTokenResponse } from '@meetio/shared';
import { ApiErrorCode } from '@meetio/shared';
import { createSingleFlight } from './refresh-single-flight';
import { clearTokens, writeTokens } from '../storage/secure-store';
import { useSessionStore } from '../store/session.store';
import { CONSENT_ROUTE } from '../navigation/app-routes';

/** Marks a request config that has already been retried once after a refresh. */
interface RetriableConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 15_000,
});

/**
 * `/auth/refresh` is called on a bare axios instance, deliberately bypassing
 * `apiClient`'s own interceptors — routing it through `apiClient` would feed a
 * refresh failure straight back into this same 401 handler and recurse.
 */
const rawClient: AxiosInstance = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 15_000,
});

async function performRefresh(): Promise<string> {
  const refreshToken = useSessionStore.getState().refreshToken;
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const { data } = await rawClient.post<RefreshTokenResponse>('/auth/refresh', {
    refresh_token: refreshToken,
  });

  await writeTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
  useSessionStore.getState().setTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  });

  return data.access_token;
}

/**
 * Single-flight guard around `performRefresh`. Three requests hitting 401 at
 * the same instant must share one `/auth/refresh` call — see
 * `refresh-single-flight.ts` for why concurrent refreshes are unsafe.
 */
export const refreshAccessToken = createSingleFlight(performRefresh);

apiClient.interceptors.request.use((config) => {
  const { accessToken } = useSessionStore.getState();
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorEnvelope>) => {
    const config = error.config as RetriableConfig | undefined;
    const code = error.response?.data?.error?.code;
    const isExpiredToken = error.response?.status === 401 && code === ApiErrorCode.TOKEN_EXPIRED;
    const isConsentRequired =
      error.response?.status === 403 && code === ApiErrorCode.CONSENT_REQUIRED;

    if (isConsentRequired) {
      // The server is the source of truth for consent (NFR-01) — a request
      // can be rejected here even when the client's own `/me` cache still
      // shows an accepted consent (stale cache, or the consent text changed
      // server-side after the cache was read). Route straight to the consent
      // screen instead of surfacing a generic error the user cannot act on.
      //
      // `expo-router` is required lazily, here, rather than imported at the
      // top of the file: a top-level import pulls it into every test that
      // transitively imports this module (most `src/api/*` and `src/hooks/*`
      // tests), and almost none of them mock it — see `axios-client.test.ts`,
      // the one test file that actually exercises this branch and does mock
      // it. Deferring the require to this call site keeps every other
      // consumer's import graph unchanged.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
      const { router } = require('expo-router') as typeof import('expo-router');
      router.replace(CONSENT_ROUTE);
    }

    if (!isExpiredToken || !config || config._retriedAfterRefresh) {
      return Promise.reject(error);
    }

    config._retriedAfterRefresh = true;

    try {
      const newAccessToken = await refreshAccessToken();
      config.headers.set('Authorization', `Bearer ${newAccessToken}`);
      return apiClient(config);
    } catch (refreshError) {
      await clearTokens();
      useSessionStore.getState().clearTokens();
      return Promise.reject(refreshError);
    }
  },
);
