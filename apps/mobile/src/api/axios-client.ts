import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorEnvelope, RefreshTokenResponse } from '@meetio/shared';
import { ApiErrorCode } from '@meetio/shared';
import { createSingleFlight } from './refresh-single-flight';
import { clearTokens, writeTokens } from '../storage/secure-store';
import { useSessionStore } from '../store/session.store';

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
