import axios from 'axios';
import { apiClient } from './axios-client';
import { useSessionStore } from '../store/session.store';
import { CONSENT_ROUTE } from '../navigation/app-routes';

// axios-client.ts now redirects to the consent screen on a 403
// CONSENT_REQUIRED response — real `expo-router` is ESM and breaks Jest's
// CJS transform on import, so every test that pulls in axios-client.ts
// (directly or transitively) must mock it, same convention as every other
// module in this app that imports `router`.
const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockRouterReplace(...args), push: jest.fn(), back: jest.fn() },
}));

/**
 * Integration test for the axios-client's 401 refresh flow, run against a
 * hand-rolled fake `axios` (mocked adapter) rather than a live server — per
 * this phase's scope, `apps/api` does not serve `/auth/*` yet (Phase 03).
 *
 * The fake reproduces just enough of axios's real contract (interceptor
 * chain, callable instance for retries, an `AxiosHeaders`-like `.set`/`.get`)
 * for `axios-client.ts`'s interceptors to run unmodified against it.
 */
interface FakeHeaders {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}
interface FakeRequestConfig {
  headers: FakeHeaders;
  method?: string;
  url?: string;
  data?: unknown;
}
interface FakeResponse {
  status: number;
  data: unknown;
}
type FakeResult = FakeResponse & { config: FakeRequestConfig };
type FakeInterceptor = (config: FakeRequestConfig) => FakeRequestConfig | Promise<FakeRequestConfig>;
interface FakeAxiosInstance {
  (config: FakeRequestConfig): Promise<FakeResult>;
  get(url: string, config?: Partial<FakeRequestConfig>): Promise<FakeResult>;
  post(url: string, data?: unknown, config?: Partial<FakeRequestConfig>): Promise<FakeResult>;
  __setTransport(fn: (config: FakeRequestConfig) => Promise<FakeResponse>): void;
}

jest.mock('axios', () => {
  class MutableHeaders {
    private map = new Map<string, string>();
    set(key: string, value: string) {
      this.map.set(key, value);
    }
    get(key: string) {
      return this.map.get(key);
    }
  }

  function createInstance() {
    const requestInterceptors: FakeInterceptor[] = [];
    let responseInterceptor: {
      onFulfilled: (response: FakeResult) => unknown;
      onRejected: (error: unknown) => unknown;
    } | null = null;
    let transport: (config: FakeRequestConfig) => Promise<FakeResponse> = async () => {
      throw new Error('transport not configured for this fake axios instance');
    };

    async function request(config: FakeRequestConfig): Promise<unknown> {
      let resolvedConfig: FakeRequestConfig = { ...config, headers: config.headers ?? new MutableHeaders() };
      for (const interceptor of requestInterceptors) {
        resolvedConfig = await interceptor(resolvedConfig);
      }

      const response = await transport(resolvedConfig);

      if (response.status >= 200 && response.status < 300) {
        const success: FakeResult = { ...response, config: resolvedConfig };
        return responseInterceptor ? responseInterceptor.onFulfilled(success) : success;
      }

      const error = Object.assign(new Error('Request failed'), {
        response,
        config: resolvedConfig,
        isAxiosError: true,
      });
      if (responseInterceptor) {
        return responseInterceptor.onRejected(error);
      }
      throw error;
    }

    const instance = ((config: FakeRequestConfig) => request(config)) as FakeAxiosInstance;
    (instance as unknown as { interceptors: unknown }).interceptors = {
      request: { use: (fn: FakeInterceptor) => requestInterceptors.push(fn) },
      response: {
        use: (onFulfilled: (r: FakeResult) => unknown, onRejected: (e: unknown) => unknown) => {
          responseInterceptor = { onFulfilled, onRejected };
        },
      },
    };
    instance.get = (url, config = {}) =>
      request({ ...config, method: 'get', url, headers: config.headers ?? new MutableHeaders() }) as unknown as Promise<FakeResult>;
    instance.post = (url, data, config = {}) =>
      request({ ...config, method: 'post', url, data, headers: config.headers ?? new MutableHeaders() }) as unknown as Promise<FakeResult>;
    instance.__setTransport = (fn) => {
      transport = fn;
    };

    return instance;
  }

  return {
    __esModule: true,
    default: { create: jest.fn(createInstance) },
    isAxiosError: (error: unknown) => !!(error as { isAxiosError?: boolean } | null)?.isAxiosError,
  };
});

const createMock = axios.create as jest.MockedFunction<typeof axios.create>;
// axios-client.ts calls axios.create() twice at module load: apiClient first, rawClient second.
const apiInstance = createMock.mock.results[0]!.value as unknown as FakeAxiosInstance;
const rawInstance = createMock.mock.results[1]!.value as unknown as FakeAxiosInstance;

describe('apiClient 401 refresh flow', () => {
  beforeEach(() => {
    useSessionStore.setState({ accessToken: null, refreshToken: null, authStatus: 'hydrating' });
  });

  it('coalesces three concurrent TOKEN_EXPIRED responses into exactly one refresh call', async () => {
    useSessionStore.getState().setTokens({ accessToken: 'old-token', refreshToken: 'old-refresh' });

    apiInstance.__setTransport(async (config) => {
      const authHeader = config.headers.get('Authorization');
      if (authHeader === 'Bearer old-token') {
        return {
          status: 401,
          data: { error: { code: 'TOKEN_EXPIRED', message: 'Phiên hết hạn', details: {} } },
        };
      }
      return { status: 200, data: { ok: true } };
    });

    const refreshTransport = jest.fn(async () => ({
      status: 200,
      data: { access_token: 'new-token', refresh_token: 'new-refresh' },
    }));
    rawInstance.__setTransport(refreshTransport);

    const results = await Promise.all([
      apiClient.get('/protected'),
      apiClient.get('/protected'),
      apiClient.get('/protected'),
    ]);

    expect(refreshTransport).toHaveBeenCalledTimes(1);
    results.forEach((result) => expect(result.data).toEqual({ ok: true }));
    expect(useSessionStore.getState().accessToken).toBe('new-token');
    expect(useSessionStore.getState().refreshToken).toBe('new-refresh');
  });

  it('clears the session when the refresh call itself fails', async () => {
    useSessionStore.getState().setTokens({ accessToken: 'old-token', refreshToken: 'old-refresh' });

    apiInstance.__setTransport(async () => ({
      status: 401,
      data: { error: { code: 'TOKEN_EXPIRED', message: 'Phiên hết hạn', details: {} } },
    }));
    rawInstance.__setTransport(async () => ({
      status: 401,
      data: { error: { code: 'UNAUTHORIZED', message: 'Refresh token invalid', details: {} } },
    }));

    await expect(apiClient.get('/protected')).rejects.toBeTruthy();

    expect(useSessionStore.getState().authStatus).toBe('unauthenticated');
    expect(useSessionStore.getState().accessToken).toBeNull();
  });

  it('does not touch the refresh flow for errors other than TOKEN_EXPIRED', async () => {
    useSessionStore.getState().setTokens({ accessToken: 'old-token', refreshToken: 'old-refresh' });

    apiInstance.__setTransport(async () => ({
      status: 400,
      data: { error: { code: 'VALIDATION_ERROR', message: 'invalid', details: {} } },
    }));
    const refreshTransport = jest.fn();
    rawInstance.__setTransport(refreshTransport);

    await expect(apiClient.get('/protected')).rejects.toBeTruthy();
    expect(refreshTransport).not.toHaveBeenCalled();
  });
});

describe('apiClient CONSENT_REQUIRED redirect (NFR-01)', () => {
  beforeEach(() => {
    mockRouterReplace.mockClear();
    useSessionStore.setState({ accessToken: null, refreshToken: null, authStatus: 'hydrating' });
  });

  it('redirects to the consent screen on a 403 CONSENT_REQUIRED response', async () => {
    apiInstance.__setTransport(async () => ({
      status: 403,
      data: { error: { code: 'CONSENT_REQUIRED', message: 'Cần đồng ý trước', details: {} } },
    }));

    await expect(apiClient.post('/meetings')).rejects.toBeTruthy();

    expect(mockRouterReplace).toHaveBeenCalledWith(CONSENT_ROUTE);
  });

  it('does not redirect for a 403 that carries a different error code', async () => {
    apiInstance.__setTransport(async () => ({
      status: 403,
      data: { error: { code: 'VALIDATION_ERROR', message: 'invalid', details: {} } },
    }));

    await expect(apiClient.post('/meetings')).rejects.toBeTruthy();

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
