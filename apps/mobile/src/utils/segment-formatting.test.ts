import { formatGapLabel, formatSegmentTimestamp } from './segment-formatting';

describe('formatSegmentTimestamp', () => {
  it('formats sub-minute offsets', () => {
    expect(formatSegmentTimestamp(5_000)).toBe('00:05');
  });

  it('formats multi-minute offsets', () => {
    expect(formatSegmentTimestamp(125_000)).toBe('02:05');
  });

  it('clamps a negative offset to zero rather than throwing', () => {
    expect(formatSegmentTimestamp(-100)).toBe('00:00');
  });
});

describe('formatGapLabel', () => {
  it('rounds to the nearest second', () => {
    expect(formatGapLabel(2_400)).toBe('— Khoảng lặng 2s —');
  });

  it('never reports zero seconds for a real gap', () => {
    expect(formatGapLabel(200)).toBe('— Khoảng lặng 1s —');
  });
});
