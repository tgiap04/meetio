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
});
