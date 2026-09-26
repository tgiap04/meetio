import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';

const REQUEST_ID = /^[\w-]{8,64}$/;

/**
 * One structured line per HTTP request (NFR-11): request id (the caller's `x-request-id` if it is
 * sane, else a new one — echoed back), method, route PATTERN (never the URL: a query string can
 * hold a search text), status, duration, user id. No bodies, no headers.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<{ method: string; headers: Record<string, string | undefined>; route?: { path?: string }; user?: { userId?: string } }>();
    const res = http.getResponse<{ statusCode: number; setHeader(name: string, value: string): void }>();
    const incoming = req.headers['x-request-id'];
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', requestId);
    const started = Date.now();
    const done = (status: number) =>
      this.logger.log({
        event: 'http_request',
        request_id: requestId,
        method: req.method,
        route: req.route?.path ?? null,
        status,
        duration_ms: Date.now() - started,
        user_id: req.user?.userId ?? null,
      });
    return next.handle().pipe(
      tap({
        next: () => done(res.statusCode),
        error: (e: { getStatus?: () => number }) => done(typeof e?.getStatus === 'function' ? e.getStatus() : 500),
      }),
    );
  }
}
