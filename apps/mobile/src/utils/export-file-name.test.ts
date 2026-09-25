import { sanitizeExportFileName } from './export-file-name';

describe('sanitizeExportFileName', () => {
  it('keeps letters, digits, and Vietnamese diacritics', () => {
    expect(sanitizeExportFileName('Họp Sprint 12')).toBe('Họp_Sprint_12');
  });

  it('collapses punctuation and spaces into underscores', () => {
    expect(sanitizeExportFileName('Q3 Review: Budget / Roadmap')).toBe('Q3_Review_Budget_Roadmap');
  });

  it('falls back to a default name for an empty or fully-stripped title', () => {
    expect(sanitizeExportFileName('   ')).toBe('cuoc-hop');
    expect(sanitizeExportFileName('***')).toBe('cuoc-hop');
  });

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeExportFileName(long).length).toBe(60);
  });
});
