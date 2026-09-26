import { formatCitationDate, parseQaDateInput } from './qa-formatting';

describe('formatCitationDate', () => {
  it('formats an ISO timestamp as dd/MM', () => {
    expect(formatCitationDate('2026-05-03T10:00:00.000Z')).toBe('03/05');
  });

  it('renders an em dash for a meeting with no recorded start', () => {
    expect(formatCitationDate(null)).toBe('—');
  });
});

describe('parseQaDateInput', () => {
  it('parses a real DD/MM/YYYY date to YYYY-MM-DD', () => {
    expect(parseQaDateInput('15/05/2026')).toBe('2026-05-15');
  });

  it('clears the bound on blank input', () => {
    expect(parseQaDateInput('   ')).toBeNull();
  });

  it('rejects text that does not match the shape', () => {
    expect(parseQaDateInput('2026-05-15')).toBeNull();
  });

  it('rejects a calendar-invalid date (e.g. 31/02)', () => {
    expect(parseQaDateInput('31/02/2026')).toBeNull();
  });
});
