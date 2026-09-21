import { isRenderableVietnameseText, typography } from './typography';

describe('typography tokens', () => {
  it('defines display for the splash wordmark with a bold weight', () => {
    expect(typography.display.fontFamily).toBeTruthy();
    expect(typography.display.fontWeight).toBe('700');
    expect(typography.display.fontSize).toBeGreaterThan(typography.title.fontSize);
  });

  it('defines heading for the two-line onboarding/permission titles with a bold weight', () => {
    expect(typography.heading.fontFamily).toBeTruthy();
    expect(typography.heading.fontWeight).toBe('700');
    expect(typography.heading.fontSize).toBeGreaterThan(0);
  });
});

describe('isRenderableVietnameseText', () => {
  it('accepts Vietnamese strings using the full range of diacritics used in the app', () => {
    const samples = [
      'Xin chào, đây là Meetio.',
      'Đồng ý ghi âm',
      'Cần xác nhận đồng ý ghi âm trước khi bắt đầu.',
      'Không thể kết nối máy chủ. Kiểm tra kết nối mạng và thử lại.',
      'ườ ệ ấ ỡ ộ ắ ằ ẳ ẵ ặ',
      'English → Vietnamese',
    ];

    samples.forEach((sample) => expect(isRenderableVietnameseText(sample)).toBe(true));
  });

  it('rejects text containing characters outside the supported Latin ranges', () => {
    expect(isRenderableVietnameseText('Xin chào 😀')).toBe(false);
    expect(isRenderableVietnameseText('こんにちは')).toBe(false);
  });
});
