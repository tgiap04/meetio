import { jest } from '@jest/globals';
import { HttpException, Logger, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor.js';

type Req = { method: string; headers: Record<string, string | undefined>; route?: { path?: string }; user?: { userId?: string } };

function httpContext(req: Req, statusCode = 200) {
  const setHeader = jest.fn<(name: string, value: string) => void>();
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode, setHeader }) }),
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

const handler = (result: ReturnType<CallHandler['handle']>): CallHandler => ({ handle: () => result });

describe('RequestLoggingInterceptor', () => {
  let logged: Record<string, unknown>[];
  beforeEach(() => {
    logged = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((msg: unknown) => {
      if (msg && typeof msg === 'object') logged.push(msg as Record<string, unknown>);
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const run = (req: Req, result: ReturnType<CallHandler['handle']> = of(null), status = 200) => {
    const { context, setHeader } = httpContext(req, status);
    return { done: lastValueFrom(new RequestLoggingInterceptor().intercept(context, handler(result))).catch(() => undefined), setHeader };
  };

  it('echoes a sane x-request-id and logs one structured line with the route pattern and user', async () => {
    const { done, setHeader } = run({ method: 'POST', headers: { 'x-request-id': 'abc-123-def' }, route: { path: '/api/meetings' }, user: { userId: 'u1' } }, of(null), 201);
    await done;
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'abc-123-def');
    expect(logged).toEqual([
      { event: 'http_request', request_id: 'abc-123-def', method: 'POST', route: '/api/meetings', status: 201, duration_ms: expect.any(Number), user_id: 'u1' },
    ]);
  });

  it.each([
    ['has spaces', 'invalid with spaces'],
    ['is too short', 'abc'],
    ['tries header injection', 'abc-123\r\nSet-Cookie: x=1'],
    ['is missing', undefined],
  ])('replaces an x-request-id that %s with a fresh UUID', async (_case, incoming) => {
    const { done, setHeader } = run({ method: 'GET', headers: { 'x-request-id': incoming }, route: { path: '/api/actions' } });
    await done;
    const [, id] = setHeader.mock.calls[0];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(logged[0]).toMatchObject({ request_id: id, user_id: null });
  });

  it("logs an error's HTTP status, and 500 for an unexpected error", async () => {
    await run({ method: 'GET', headers: {}, route: { path: '/api/x' } }, throwError(() => new HttpException('nope', 404))).done;
    await run({ method: 'GET', headers: {}, route: { path: '/api/y' } }, throwError(() => new Error('boom'))).done;
    expect(logged.map((l) => [l.route, l.status])).toEqual([
      ['/api/x', 404],
      ['/api/y', 500],
    ]);
  });

  it('leaves non-HTTP contexts alone', async () => {
    const context = { getType: () => 'ws' } as unknown as ExecutionContext;
    await lastValueFrom(new RequestLoggingInterceptor().intercept(context, handler(of('ok'))));
    expect(logged).toEqual([]);
  });
});
