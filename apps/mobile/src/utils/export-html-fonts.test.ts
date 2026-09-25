import { ensureVietnameseFontStack } from './export-html-fonts';

describe('ensureVietnameseFontStack', () => {
  it('injects charset and font stack into an existing <head>', () => {
    const result = ensureVietnameseFontStack('<html><head><title>x</title></head><body>Cuộc họp</body></html>');
    expect(result).toContain('<meta charset="UTF-8" />');
    expect(result).toContain('Noto Sans');
    expect(result).toContain('Cuộc họp');
  });

  it('wraps a bare fragment in a full document with the font stack', () => {
    const result = ensureVietnameseFontStack('<p>Tóm tắt cuộc họp</p>');
    expect(result).toMatch(/^<!DOCTYPE html>/);
    expect(result).toContain('<meta charset="UTF-8" />');
    expect(result).toContain('<p>Tóm tắt cuộc họp</p>');
  });
});
