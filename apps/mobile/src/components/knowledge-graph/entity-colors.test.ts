import { colors } from '../../theme/colors';
import { getEntityPalette } from './entity-colors';
import type { GraphPaletteKey } from '../../mocks/types';

const ALL_PALETTE_KEYS: readonly GraphPaletteKey[] = ['blue', 'lavender', 'mint', 'amber', 'orange'];

describe('getEntityPalette', () => {
  it('maps every palette key to a defined fill and text token', () => {
    for (const key of ALL_PALETTE_KEYS) {
      const palette = getEntityPalette(key);
      expect(typeof palette.fill).toBe('string');
      expect(palette.fill.length).toBeGreaterThan(0);
      expect(typeof palette.text).toBe('string');
      expect(palette.text.length).toBeGreaterThan(0);
    }
  });

  it('gives each non-central palette a distinct fill', () => {
    const fills = new Set((['blue', 'lavender', 'mint', 'amber'] as const).map((key) => getEntityPalette(key).fill));
    expect(fills.size).toBe(4);
  });

  it('resolves the central Project node to the solid orange fill with white text', () => {
    expect(getEntityPalette('orange')).toEqual({ fill: colors.entityProjectFill, text: colors.primaryText });
  });
});
