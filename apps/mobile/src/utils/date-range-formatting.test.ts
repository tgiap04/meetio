import { formatDateRangeLabel } from './date-range-formatting';

describe('formatDateRangeLabel', () => {
  it('returns null when neither bound is set', () => {
    expect(formatDateRangeLabel(null, null)).toBeNull();
  });

  it('formats a full range as "Từ DD/MM – DD/MM"', () => {
    // Local-time-safe: matches the shape rather than an exact calendar day,
    // same convention as `meeting-formatting.test.ts` — a Z-suffixed ISO
    // string's local calendar day depends on the test runner's time zone.
    expect(formatDateRangeLabel('2026-09-01T12:00:00.000Z', '2026-09-25T12:00:00.000Z')).toMatch(
      /^Từ \d{2}\/\d{2} – \d{2}\/\d{2}$/,
    );
  });

  it('formats a from-only range', () => {
    expect(formatDateRangeLabel('2026-09-01T12:00:00.000Z', null)).toMatch(/^Từ \d{2}\/\d{2}$/);
  });

  it('formats a to-only range', () => {
    expect(formatDateRangeLabel(null, '2026-09-25T12:00:00.000Z')).toMatch(/^Đến \d{2}\/\d{2}$/);
  });
});
