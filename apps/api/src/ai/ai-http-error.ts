import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiErrorCode } from '@meetio/shared';
import { AiServiceUnavailableError, QuotaExceededError } from './ai-errors.js';

/** Request-path AI failures as API errors: budget spent → 429 QUOTA_EXCEEDED, Gemini down → 503 (api-spec §9). */
export function aiErrorToHttp(error: unknown): unknown {
  if (error instanceof QuotaExceededError) {
    return new HttpException({ code: ApiErrorCode.QUOTA_EXCEEDED, message: error.message, details: {} }, HttpStatus.TOO_MANY_REQUESTS);
  }
  if (error instanceof AiServiceUnavailableError) {
    return new ServiceUnavailableException({ code: ApiErrorCode.AI_SERVICE_UNAVAILABLE, message: error.message, details: {} });
  }
  return error;
}
