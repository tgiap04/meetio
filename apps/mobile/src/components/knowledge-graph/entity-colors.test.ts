import type { EntityType } from '@meetio/shared';
import { colors } from '../../theme/colors';
import { getEntityPalette } from './entity-colors';

const ALL_TYPES: readonly EntityType[] = ['person', 'organization', 'topic', 'product', 'project', 'other'];

describe('getEntityPalette', () => {
  it('maps every entity type to a defined fill and text token', () => {
    for (const type of ALL_TYPES) {
      const palette = getEntityPalette(type);
      expect(typeof palette.fill).toBe('string');
      expect(palette.fill.length).toBeGreaterThan(0);
      expect(typeof palette.text).toBe('string');
      expect(palette.text.length).toBeGreaterThan(0);
    }
  });

  it('gives person/organization/topic/product distinct fills', () => {
    const fills = new Set(
      (['person', 'organization', 'topic', 'product'] as const).map((type) => getEntityPalette(type).fill),
    );
    expect(fills.size).toBe(4);
  });

  it('resolves project to the solid orange fill with white text', () => {
    expect(getEntityPalette('project')).toEqual({ fill: colors.entityProjectFill, text: colors.primaryText });
  });

  it('resolves the undrawn "other" type to a neutral palette', () => {
    expect(getEntityPalette('other')).toEqual({ fill: colors.border, text: colors.textMuted });
  });
});
