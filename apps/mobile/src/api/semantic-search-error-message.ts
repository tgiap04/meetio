import { isAxiosError } from 'axios';
import type { ApiErrorEnvelope } from '@meetio/shared';
import { ApiErrorCode } from '@meetio/shared';
import { getErrorMessage } from './error-messages';

/**
 * Vietnamese copy for the Search tab's Transcript section when the semantic
 * search endpoint is unavailable (clarifications.md, 2026-09-26): Gemini not
 * configured or every key resting. `getErrorMessage`'s generic fallback
 * ("Dịch vụ AI tạm thời không khả dụng.") is close but not the exact copy the
 * decision calls for, so this overrides just that one code and defers to the
 * shared table for every other error (429 QUOTA_EXCEEDED / RATE_LIMITED,
 * network errors, etc).
 */
export function getSemanticSearchErrorMessage(error: unknown): string {
  if (isAxiosError<ApiErrorEnvelope>(error) && error.response?.data?.error?.code === ApiErrorCode.AI_SERVICE_UNAVAILABLE) {
    return 'Tìm kiếm ngữ nghĩa tạm thời không khả dụng.';
  }
  return getErrorMessage(error);
}
