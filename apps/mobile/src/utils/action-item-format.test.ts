import { formatDueDateDisplay, formatDueDateForInput, parseDueDateInput } from './action-item-format';

describe('formatDueDateDisplay', () => {
  it('formats an ISO date as DD/MM', () => {
    expect(formatDueDateDisplay('2026-03-05')).toBe('05/03');
  });

  it('returns null for a null due date', () => {
    expect(formatDueDateDisplay(null)).toBeNull();
  });
});

describe('formatDueDateForInput', () => {
  it('formats an ISO date as DD/MM/YYYY', () => {
    expect(formatDueDateForInput('2026-03-05')).toBe('05/03/2026');
  });

  it('returns an empty string for a null due date', () => {
    expect(formatDueDateForInput(null)).toBe('');
  });
});

describe('parseDueDateInput', () => {
  it('parses a valid DD/MM/YYYY string to YYYY-MM-DD', () => {
    expect(parseDueDateInput('05/03/2026')).toEqual({ value: '2026-03-05', valid: true });
  });

  it('treats blank input as a valid way to clear the due date', () => {
    expect(parseDueDateInput('')).toEqual({ value: null, valid: true });
    expect(parseDueDateInput('   ')).toEqual({ value: null, valid: true });
  });

  it('rejects a malformed string', () => {
    expect(parseDueDateInput('not a date')).toEqual({ value: null, valid: false });
  });

  it('rejects a calendar-invalid date (day 31 in a 30-day month)', () => {
    expect(parseDueDateInput('31/04/2026')).toEqual({ value: null, valid: false });
  });
});
