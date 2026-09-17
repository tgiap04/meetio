/**
 * Knowledge-graph entity type.
 * Source of truth: docs/data-model.md `entities.type` (entity_type enum).
 */
export const EntityType = {
  PERSON: 'person',
  PROJECT: 'project',
  ORGANIZATION: 'organization',
  TOPIC: 'topic',
  PRODUCT: 'product',
  OTHER: 'other',
} as const;

export type EntityType = (typeof EntityType)[keyof typeof EntityType];
