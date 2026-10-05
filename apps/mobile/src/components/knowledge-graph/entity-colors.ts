/**
 * `EntityType → { fill, text }` — the single place the knowledge-graph screen
 * (`graph-node.tsx`, `relation-list.tsx`) resolves node colour. Real entities
 * only carry a `type` (no per-node palette from the API, unlike the retired
 * mock fixture), so this is a straight type→colour map: the five measured
 * palettes from `design/screen-10-knowledge-graph.png` plus a neutral for
 * `other`, which the design never drew.
 */
import type { EntityType } from '@meetio/shared';
import { colors } from '../../theme/colors';

export interface EntityPalette {
  readonly fill: string;
  readonly text: string;
}

const PALETTE: Record<EntityType, EntityPalette> = {
  person: { fill: colors.entityBlueTint, text: colors.entityBlueText },
  organization: { fill: colors.entityLavenderTint, text: colors.entityLavenderText },
  topic: { fill: colors.entityMintTint, text: colors.entityMintText },
  product: { fill: colors.entityAmberTint, text: colors.entityAmberText },
  /** Solid fill, white text — matches the design's one Project-node treatment. */
  project: { fill: colors.entityProjectFill, text: colors.primaryText },
  /** Never drawn in the design — a plain neutral tint/border pair. */
  other: { fill: colors.border, text: colors.textMuted },
};

export function getEntityPalette(type: EntityType): EntityPalette {
  return PALETTE[type];
}

export interface GraphPillPalette extends EntityPalette {
  readonly border: string;
}

/**
 * Pastel fill + 1px type-coloured border for the ring pills on the graph
 * canvas. Same as `getEntityPalette` except where that palette's text fails
 * AA on its own fill at pill size: `project` (white on solid orange, 2.6:1)
 * becomes a white pill with orange border and `primaryStrong` text (4.9:1),
 * and `other` (muted on `border`, 3.9:1) moves onto `surface` (4.5:1).
 */
export function getGraphPillPalette(type: EntityType): GraphPillPalette {
  if (type === 'project') {
    return { fill: colors.background, text: colors.primaryStrong, border: colors.primary };
  }
  if (type === 'other') {
    return { fill: colors.surface, text: colors.textMuted, border: colors.textMuted };
  }
  const { fill, text } = PALETTE[type];
  return { fill, text, border: text };
}
