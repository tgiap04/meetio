/**
 * Category of a knowledge-graph entity.
 * Mirrors PG enum `entity_type` (see docs/data-model.md §4).
 */
export enum EntityType {
  PERSON = 'person',
  PROJECT = 'project',
  ORGANIZATION = 'organization',
  TOPIC = 'topic',
  PRODUCT = 'product',
  OTHER = 'other',
}
