import { getErrorMessage } from './error-messages';

function makeAxiosError(overrides: { status?: number; data?: unknown } = {}) {
  return {
    isAxiosError: true,
    response: {
      status: overrides.status ?? 401,
      data: overrides.data,
    },
  };
}

describe('getErrorMessage', () => {
  it("prefers the server's own message when present", () => {
    const error = makeAxiosError({
      data: { error: { code: 'VALIDATION_ERROR', message: 'Email không hợp lệ', details: {} } },
    });

    expect(getErrorMessage(error)).toBe('Email không hợp lệ');
  });

  it('falls back to a known code when the server sends no message', () => {
    const error = makeAxiosError({
      data: { error: { code: 'QUOTA_EXCEEDED', message: '', details: {} } },
    });

    expect(getErrorMessage(error)).toBe('Đã vượt hạn mức sử dụng trong tháng.');
  });

  it('returns a network-failure message when there is no response at all', () => {
    const error = { isAxiosError: true, response: undefined };

    expect(getErrorMessage(error)).toBe(
      'Không thể kết nối máy chủ. Kiểm tra kết nối mạng và thử lại.',
    );
  });

  it('returns a network-failure message for a non-axios error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe(
      'Không thể kết nối máy chủ. Kiểm tra kết nối mạng và thử lại.',
    );
  });

  it('falls back to a consent-required prompt for CONSENT_REQUIRED', () => {
    const error = makeAxiosError({
      status: 403,
      data: { error: { code: 'CONSENT_REQUIRED', message: '', details: {} } },
    });

    expect(getErrorMessage(error)).toBe(
      'Bạn cần đồng ý với chính sách ghi âm trước khi tiếp tục.',
    );
  });

  it('falls back to a retry prompt for GOOGLE_TOKEN_INVALID', () => {
    const error = makeAxiosError({
      data: { error: { code: 'GOOGLE_TOKEN_INVALID', message: '', details: {} } },
    });

    expect(getErrorMessage(error)).toBe('Đăng nhập Google thất bại, vui lòng thử lại.');
  });

  it('getErrorMessage trả câu hướng dẫn xác minh email cho GOOGLE_EMAIL_UNVERIFIED', () => {
    const error = makeAxiosError({
      data: { error: { code: 'GOOGLE_EMAIL_UNVERIFIED', message: '', details: {} } },
    });

    expect(getErrorMessage(error)).toBe(
      'Tài khoản Google này chưa xác minh email. Hãy xác minh email với Google rồi thử lại.',
    );
  });
});
