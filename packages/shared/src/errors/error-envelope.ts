import type { ApiErrorCode } from '../enums/api-error-code';

/**
 * Standard error envelope for every failed API response.
 * Source of truth: docs/api-spec.md §0 (Qui ước chung).
 *
 * Example:
 * { "error": { "code": "MEETING_NOT_FOUND", "message": "Không tìm thấy cuộc họp", "details": {} } }
 */
export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}
