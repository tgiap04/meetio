/**
 * `GraphPaletteKey → { fill, text }` — the single place the knowledge-graph
 * screen (`graph-node.tsx`, `relation-list.tsx`) resolves node colour. The
 * design colours each node individually rather than by type (two Person
 * nodes differ, two Task nodes differ — see `types.ts`'s `GraphPaletteKey`
 * doc comment), so this maps the five measured palettes, not the three node
 * types.
 */
import { colors } from '../../theme/colors';
import type { GraphPaletteKey } from '../../mocks/types';

export interface EntityPalette {
  readonly fill: string;
  readonly text: string;
}

const PALETTE: Record<GraphPaletteKey, EntityPalette> = {
  blue: { fill: colors.entityBlueTint, text: colors.entityBlueText },
  lavender: { fill: colors.entityLavenderTint, text: colors.entityLavenderText },
  mint: { fill: colors.entityMintTint, text: colors.entityMintText },
  amber: { fill: colors.entityAmberTint, text: colors.entityAmberText },
  /** The single central Project node — solid fill, white text, not a tint. */
  orange: { fill: colors.entityProjectFill, text: colors.primaryText },
};

export function getEntityPalette(paletteKey: GraphPaletteKey): EntityPalette {
  return PALETTE[paletteKey];
}
