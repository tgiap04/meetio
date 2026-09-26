import { EntityType } from '@meetio/shared';
import { normalizeEntityName } from './name-normalizer.js';

const ENTITY_TYPES = Object.values(EntityType) as string[];

/** What the extract step keeps for one chunk (`meeting_chunks.extraction`). */
export interface ChunkExtraction {
  entities: { name: string; type: EntityType; description: string | null }[];
  relations: { source: string; target: string; relationship: string; confidence: number }[];
}

/** Gemini structured-output schema for one extraction call over labelled chunks (phase-13 step 1). */
export const EXTRACTION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    entities: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          type: { type: 'STRING', enum: ENTITY_TYPES },
          description: { type: 'STRING' },
          chunks: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['name', 'type', 'chunks'],
      },
    },
    relations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          source: { type: 'STRING' },
          target: { type: 'STRING' },
          relationship: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          chunk: { type: 'STRING' },
        },
        required: ['source', 'target', 'relationship', 'confidence', 'chunk'],
      },
    },
  },
  required: ['entities', 'relations'],
};

export class ExtractionSchemaError extends Error {}

const MAX_NAME = 200;
const MAX_RELATIONSHIP = 120;
const MAX_DESCRIPTION = 500;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, field: string): string => {
  if (typeof v !== 'string') throw new ExtractionSchemaError(`${field} không phải chuỗi`);
  return v.trim();
};

/**
 * Parses and checks one model answer against the schema, then splits it per chunk label.
 *
 * Structural problems (not JSON, wrong shapes, unknown type) throw `ExtractionSchemaError` — the
 * caller retries. Content the model cannot back up is dropped instead of retried: a citation of a
 * label that was not sent, or a relation whose ends are not entities of the chunk it cites
 * (the "LLM invents relations" risk in phase-13).
 */
export function parseExtraction(text: string, labels: readonly string[]): Map<string, ChunkExtraction> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ExtractionSchemaError('không phải JSON hợp lệ');
  }
  if (!isObject(raw) || !Array.isArray(raw.entities) || !Array.isArray(raw.relations)) {
    throw new ExtractionSchemaError('thiếu mảng entities/relations');
  }

  const out = new Map<string, ChunkExtraction>(labels.map((l) => [l, { entities: [], relations: [] }]));
  const known = new Map<string, Map<string, string>>(labels.map((l) => [l, new Map()])); // label → normalized → name

  for (const item of raw.entities) {
    if (!isObject(item)) throw new ExtractionSchemaError('entity không phải object');
    const name = str(item.name, 'entity.name');
    const type = str(item.type, 'entity.type');
    // The value came from the model: keep it out of the message (it can reach logs — NFR-04).
    if (!ENTITY_TYPES.includes(type)) throw new ExtractionSchemaError('loại thực thể lạ');
    if (!Array.isArray(item.chunks)) throw new ExtractionSchemaError('entity.chunks không phải mảng');
    const description = item.description === undefined || item.description === null ? '' : str(item.description, 'entity.description');
    const key = normalizeEntityName(name, type);
    if (!key || name.length > MAX_NAME) continue;
    for (const label of new Set(item.chunks.map((c) => str(c, 'entity.chunks[]')))) {
      const chunk = out.get(label);
      if (!chunk || known.get(label)!.has(key)) continue;
      known.get(label)!.set(key, name);
      chunk.entities.push({ name, type: type as EntityType, description: description.slice(0, MAX_DESCRIPTION) || null });
    }
  }

  for (const item of raw.relations) {
    if (!isObject(item)) throw new ExtractionSchemaError('relation không phải object');
    const source = str(item.source, 'relation.source');
    const target = str(item.target, 'relation.target');
    const relationship = str(item.relationship, 'relation.relationship');
    const label = str(item.chunk, 'relation.chunk');
    if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence)) {
      throw new ExtractionSchemaError('relation.confidence không phải số');
    }
    const chunk = out.get(label);
    if (!chunk || !relationship || relationship.length > MAX_RELATIONSHIP) continue;
    // "Bình" in a relation names the entity the model called "anh Bình": match on the normalized key.
    const find = (n: string) => chunk.entities.find((e) => normalizeEntityName(n, e.type) === normalizeEntityName(e.name, e.type))?.name;
    const [s, t] = [find(source), find(target)];
    if (!s || !t || s === t) continue;
    chunk.relations.push({ source: s, target: t, relationship, confidence: Math.min(1, Math.max(0, item.confidence)) });
  }
  return out;
}
