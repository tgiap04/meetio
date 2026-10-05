import { translateToViolation } from './translate-target.js';

describe('translateToViolation', () => {
  it('accepts the other one of vi-VN / en-US, and null (off)', () => {
    expect(translateToViolation('en-US', 'vi-VN')).toBeNull();
    expect(translateToViolation('vi-VN', 'en-US')).toBeNull();
    expect(translateToViolation(null, 'vi-VN')).toBeNull();
    expect(translateToViolation(undefined, 'vi-VN')).toBeNull();
  });

  it('rejects the source language itself', () => {
    expect(translateToViolation('vi-VN', 'vi-VN')).toMatch(/khác/);
  });

  it('rejects languages outside vi-VN / en-US', () => {
    expect(translateToViolation('en', 'vi-VN')).toMatch(/vi-VN/);
    expect(translateToViolation('fr-FR', 'vi-VN')).toMatch(/vi-VN/);
  });
});
