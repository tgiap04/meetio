import type { EntityType } from '@meetio/shared';

/**
 * The knowledge-graph screens (entity list, entity detail, meeting graph)
 * all filter by the same five chips per clarifications.md (2026-09-26,
 * Phase 13): Tất cả / Người / Dự án / Chủ đề / Khác — `Khác` folds
 * `organization`, `product` and `other` together, and `task` (never a real
 * `EntityType`) is dropped entirely.
 */
export type EntityChipKey = 'all' | 'person' | 'project' | 'topic' | 'other';

export interface EntityChip {
  readonly key: EntityChipKey;
  readonly label: string;
}

export const ENTITY_TYPE_CHIPS: readonly EntityChip[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'person', label: 'Người' },
  { key: 'project', label: 'Dự án' },
  { key: 'topic', label: 'Chủ đề' },
  { key: 'other', label: 'Khác' },
];

const OTHER_TYPES: readonly EntityType[] = ['organization', 'product', 'other'];

/** Which chip an `EntityType` value falls under. */
export function entityTypeToChipKey(type: EntityType): EntityChipKey {
  if (type === 'person' || type === 'project' || type === 'topic') {
    return type;
  }
  return 'other';
}

/** The `type` query param value for `GET /entities` — a comma list for
 *  `"other"`, a single value otherwise, `undefined` for `"all"` (omit the
 *  param entirely rather than sending every type). */
export function entityChipToTypeQuery(chip: EntityChipKey): string | undefined {
  if (chip === 'all') {
    return undefined;
  }
  if (chip === 'other') {
    return OTHER_TYPES.join(',');
  }
  return chip;
}

const TYPE_LABELS: Record<EntityType, string> = {
  person: 'Người',
  project: 'Dự án',
  organization: 'Tổ chức',
  topic: 'Chủ đề',
  product: 'Sản phẩm',
  other: 'Khác',
};

/** Vietnamese label for one entity's own type, shown on its detail/list row —
 *  distinct from the chip labels above, which group several types together. */
export function entityTypeLabel(type: EntityType): string {
  return TYPE_LABELS[type];
}

export const EDITABLE_ENTITY_TYPES: readonly EntityType[] = [
  'person',
  'project',
  'organization',
  'topic',
  'product',
  'other',
];
