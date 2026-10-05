import type { EntityType } from '@meetio/shared';
import { colors } from '../../theme/colors';
import { getEntityPalette, getGraphPillPalette } from './entity-colors';

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

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('getGraphPillPalette', () => {
  it('keeps pill text at WCAG AA (4.5:1) on its fill for every entity type', () => {
    for (const type of ALL_TYPES) {
      const palette = getGraphPillPalette(type);
      expect(contrast(palette.text, palette.fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reuses the entity tint and draws the border in the type colour', () => {
    expect(getGraphPillPalette('person')).toEqual({
      fill: colors.entityBlueTint,
      text: colors.entityBlueText,
      border: colors.entityBlueText,
    });
  });

  it('turns the solid project fill into a white pill with an orange border', () => {
    expect(getGraphPillPalette('project')).toEqual({
      fill: colors.background,
      text: colors.primaryStrong,
      border: colors.primary,
    });
  });
});
