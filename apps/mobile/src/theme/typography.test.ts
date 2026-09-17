import { isRenderableVietnameseText } from './typography';

describe('isRenderableVietnameseText', () => {
  it('accepts Vietnamese strings using the full range of diacritics used in the app', () => {
    const samples = [
      'Xin chào, đây là Meetio.',
      'Đồng ý ghi âm',
      'Cần xác nhận đồng ý ghi âm trước khi bắt đầu.',
      'Không thể kết nối máy chủ. Kiểm tra kết nối mạng và thử lại.',
      'ườ ệ ấ ỡ ộ ắ ằ ẳ ẵ ặ',
    ];

    samples.forEach((sample) => expect(isRenderableVietnameseText(sample)).toBe(true));
  });

  it('rejects text containing characters outside the supported Latin ranges', () => {
    expect(isRenderableVietnameseText('Xin chào 😀')).toBe(false);
    expect(isRenderableVietnameseText('こんにちは')).toBe(false);
  });
});
