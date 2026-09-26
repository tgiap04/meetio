import { ApiErrorCode } from '@meetio/shared';
import { getSemanticSearchErrorMessage } from './semantic-search-error-message';

function axiosErrorWithCode(code: ApiErrorCode) {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true,
    response: { data: { error: { code } } },
  });
}

describe('getSemanticSearchErrorMessage', () => {
  it('returns the friendly "semantic search unavailable" copy for AI_SERVICE_UNAVAILABLE', () => {
    const message = getSemanticSearchErrorMessage(axiosErrorWithCode(ApiErrorCode.AI_SERVICE_UNAVAILABLE));
    expect(message).toBe('Tìm kiếm ngữ nghĩa tạm thời không khả dụng.');
  });

  it('falls back to the generic error message for other codes, e.g. QUOTA_EXCEEDED', () => {
    const message = getSemanticSearchErrorMessage(axiosErrorWithCode(ApiErrorCode.QUOTA_EXCEEDED));
    expect(message).toBe('Đã vượt hạn mức sử dụng trong tháng.');
  });

  it('falls back to the generic error message for a non-axios error', () => {
    const message = getSemanticSearchErrorMessage(new Error('boom'));
    expect(message).toBe('Không thể kết nối máy chủ. Kiểm tra kết nối mạng và thử lại.');
  });
});
