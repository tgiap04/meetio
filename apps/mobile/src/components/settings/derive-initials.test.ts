import { deriveInitials } from './derive-initials';

describe('deriveInitials', () => {
  it('takes the first letter of the first and last word for a multi-word name', () => {
    expect(deriveInitials('Nguyễn Văn Anh')).toBe('NA');
  });

  it('slices the first two characters of a single-word name', () => {
    expect(deriveInitials('Anh')).toBe('AN');
  });

  it('uppercases lowercase input', () => {
    expect(deriveInitials('anh nguyen')).toBe('AN');
  });

  it('collapses extra internal whitespace', () => {
    expect(deriveInitials('  Nguyễn   Văn   Anh  ')).toBe('NA');
  });

  it('returns an empty string for empty input', () => {
    expect(deriveInitials('')).toBe('');
  });
});
