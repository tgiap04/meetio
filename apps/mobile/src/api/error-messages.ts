import { isAxiosError } from 'axios';
import type { ApiErrorEnvelope } from '@meetio/shared';
import { ApiErrorCode } from '@meetio/shared';

/**
 * Fallback, human-readable Vietnamese copy per error code (docs/api-spec.md §9).
 * The server already sends a Vietnamese `message` in the error envelope — this
 * table only covers cases where that message is missing or the failure never
 * reached the server at all (network/timeout).
 */
const FALLBACK_MESSAGES: Record<ApiErrorCode, string> = {
  [ApiErrorCode.VALIDATION_ERROR]: 'Dữ liệu nhập không hợp lệ.',
  [ApiErrorCode.UNAUTHORIZED]: 'Email hoặc mật khẩu không đúng.',
  [ApiErrorCode.TOKEN_EXPIRED]: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  [ApiErrorCode.MEETING_NOT_FOUND]: 'Không tìm thấy cuộc họp.',
  [ApiErrorCode.NOT_FOUND]: 'Không tìm thấy tài nguyên yêu cầu.',
  [ApiErrorCode.INVALID_STATE_TRANSITION]: 'Thao tác không hợp lệ ở trạng thái hiện tại.',
  [ApiErrorCode.SEGMENTS_PENDING]: 'Vẫn còn dữ liệu chưa đồng bộ xong.',
  [ApiErrorCode.MEETING_NOT_READY]: 'Cuộc họp chưa xử lý xong.',
  [ApiErrorCode.PROCESSING_FAILED]: 'Xử lý thất bại, vui lòng thử lại.',
  [ApiErrorCode.QUOTA_EXCEEDED]: 'Đã vượt hạn mức sử dụng trong tháng.',
  [ApiErrorCode.RATE_LIMITED]: 'Bạn thao tác quá nhanh, vui lòng thử lại sau.',
  [ApiErrorCode.AI_SERVICE_UNAVAILABLE]: 'Dịch vụ AI tạm thời không khả dụng.',
  [ApiErrorCode.INTERNAL_ERROR]: 'Đã có lỗi xảy ra, vui lòng thử lại.',
};

const NETWORK_ERROR_MESSAGE = 'Không thể kết nối máy chủ. Kiểm tra kết nối mạng và thử lại.';

/** Resolves a user-facing Vietnamese message from any error thrown by `apiClient`. */
export function getErrorMessage(error: unknown): string {
  if (isAxiosError<ApiErrorEnvelope>(error)) {
    const body = error.response?.data?.error;
    if (body?.message) {
      return body.message;
    }
    if (body?.code && body.code in FALLBACK_MESSAGES) {
      return FALLBACK_MESSAGES[body.code];
    }
    return NETWORK_ERROR_MESSAGE;
  }

  return NETWORK_ERROR_MESSAGE;
}
