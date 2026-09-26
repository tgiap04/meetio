import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor.js';

export const GLOBAL_PREFIX = 'api';

/**
 * Everything the HTTP layer needs beyond the module graph. Shared by
 * `main.ts` and the end-to-end suites so the tests exercise the exact
 * prefix, validation and error envelope production uses.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
}
