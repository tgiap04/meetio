import { colors } from './colors';

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_BODY = 4.5;

describe('palette', () => {
  it('uses the Meetio brand orange', () => {
    expect(colors.primary).toBe('#F68001');
  });

  it('every token is a 6-digit hex', () => {
    for (const [name, value] of Object.entries(colors)) {
      expect(`${name}:${value}`).toMatch(/^[a-zA-Z]+:#[0-9A-F]{6}$/);
    }
  });
});

describe('contrast', () => {
  it.each([
    ['text on background', colors.text, colors.background],
    ['text on surface', colors.text, colors.surface],
    ['textMuted on background', colors.textMuted, colors.background],
    ['primaryStrong on background', colors.primaryStrong, colors.background],
  ])('%s clears WCAG AA for body text', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_BODY);
  });

  // Locked deliberately rather than asserted as "passing".
  //
  // design.png puts white on the brand orange, and the brand colour is fixed, so
  // this pairing ships knowingly below AA. Pinning the measured value means any
  // future change to primary or primaryText has to come here and make that trade
  // again on purpose, instead of drifting further without anyone noticing.
  it('records that white on primary is a known AA shortfall, not an accident', () => {
    const ratio = contrast(colors.primaryText, colors.primary);
    expect(ratio).toBeCloseTo(2.62, 1);
    expect(ratio).toBeLessThan(AA_BODY);
  });

  it('offers primaryStrong as the readable orange for text on light backgrounds', () => {
    // The reason primaryStrong exists: primary itself is unreadable as body text.
    expect(contrast(colors.primary, colors.background)).toBeLessThan(AA_BODY);
    expect(contrast(colors.primaryStrong, colors.background)).toBeGreaterThanOrEqual(AA_BODY);
  });
});
