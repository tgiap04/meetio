import { errorCode, stackFrames } from '../logging/log-error.js';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorCode, type ApiErrorEnvelope } from '@meetio/shared';
import { OwnershipViolationException } from '../exceptions/ownership-violation.exception.js';

/**
 * Maps a raw HTTP status to a default ApiErrorCode when the thrown exception did not
 * carry an explicit code.
 *
 * This filter NEVER guesses a domain-specific code from an HTTP status (api-spec §9,
 * "Quy tắc mã mặc định"). An unclassified 404 is `NOT_FOUND`, not `MEETING_NOT_FOUND`;
 * an unclassified failure is `INTERNAL_ERROR`, not `PROCESSING_FAILED`. Guessing wrong
 * sends the client down the wrong recovery path — reporting a pipeline failure when the
 * server actually crashed. Domain code throws its precise code explicitly instead.
 */
function defaultCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ApiErrorCode.VALIDATION_ERROR;
    case HttpStatus.UNAUTHORIZED:
      return ApiErrorCode.UNAUTHORIZED;
    case HttpStatus.NOT_FOUND:
      return ApiErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ApiErrorCode.INVALID_STATE_TRANSITION;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ApiErrorCode.PROCESSING_FAILED;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ApiErrorCode.RATE_LIMITED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ApiErrorCode.AI_SERVICE_UNAVAILABLE;
    default:
      return ApiErrorCode.INTERNAL_ERROR;
  }
}

const INTERNAL_ERROR_MESSAGE = 'Lỗi hệ thống, vui lòng thử lại sau';

interface ExceptionResponseShape {
  code?: string;
  message?: string | string[];
  details?: Record<string, unknown>;
}

/**
 * Global exception filter emitting the standard error envelope from
 * docs/api-spec.md §0: `{ "error": { "code", "message", "details" } }`.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionBody =
      exception instanceof HttpException ? (exception.getResponse() as ExceptionResponseShape | string) : undefined;

    const parsedBody: ExceptionResponseShape =
      typeof exceptionBody === 'object' && exceptionBody !== null ? exceptionBody : {};

    // Only an HttpException's message was written for the client. Anything else
    // (a pg driver error, a TypeError) can carry SQL, table names or row data, so
    // it is logged in full below and the client gets a fixed sentence instead.
    const message =
      exception instanceof HttpException
        ? Array.isArray(parsedBody.message)
          ? parsedBody.message.join('; ')
          : (parsedBody.message ?? exception.message)
        : INTERNAL_ERROR_MESSAGE;

    const code = (parsedBody.code as ApiErrorCode | undefined) ?? defaultCodeForStatus(status);

    if (exception instanceof OwnershipViolationException) {
      const request = ctx.getRequest<Request>();
      // Ownership failures are routine (never a bug) but worth a trail: they are
      // either a stale client link or someone probing another user's resources.
      // The route pattern, not the URL: a query string can carry a search text (NFR-04).
      this.logger.warn(`Ownership violation: ${request.method} ${request.route?.path ?? request.path} → ${code}`);
    } else if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Name and code locations only: an unexpected error's message (e.g. from Postgres) can carry data.
      this.logger.error(`Unhandled ${errorCode(exception)}`, stackFrames(exception));
    }

    const envelope: ApiErrorEnvelope = {
      error: {
        code,
        message,
        details: parsedBody.details ?? {},
      },
    };

    response.status(status).json(envelope);
  }
}
