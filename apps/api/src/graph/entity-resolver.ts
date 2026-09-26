import pgvector from 'pgvector/pg';
import type { EntityManager } from 'typeorm';
import type { EntityType } from '@meetio/shared';
import { normalizeEntityName } from './name-normalizer.js';

export interface ResolverOptions {
  /** Cosine similarity at or above which a new entity is proposed for merging (OQ-03). */
  suggestThreshold: number;
  /** At or above this a new name attaches to the existing entity; null = never (clarifications 2026-09-26). */
  autoMergeThreshold: number | null;
  /** Nearest neighbours considered per new entity. */
  maxSuggestions: number;
}

/**
 * 0.95 from the live check on gemini-embedding-001 (2026-09-26): true duplicates scored ≥ 0.96,
 * the closest wrong pair 0.948, and at 0.85 two different people ("Bình" / "Tuấn", 0.91) were
 * proposed. Still a default until the OQ-03 gold set calibrates it (`graph:eval`).
 */
export const DEFAULT_RESOLVER_OPTIONS: ResolverOptions = { suggestThreshold: 0.95, autoMergeThreshold: null, maxSuggestions: 3 };

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  description: string | null;
}

/** "name — description": what the entity embedding represents (data-model §4). */
export const entityEmbeddingText = (e: ExtractedEntity) => (e.description ? `${e.name} — ${e.description}` : e.name);

/**
 * The three resolution tiers of docs/system-architecture.md §5 over one user's graph. Every
 * query is scoped to `userId` and skips entities merged into another one. Callers hold the
 * user's advisory lock (`lockUserGraph`), so tier 1 cannot race another meeting into a duplicate.
 */
export class EntityResolver {
  constructor(private readonly options: ResolverOptions) {}

  /** Serialises graph writes per user for the rest of the transaction. */
  static lockUserGraph(m: EntityManager, userId: string): Promise<unknown> {
    return m.query(`SELECT pg_advisory_xact_lock(hashtextextended('graph:' || $1, 0))`, [userId]);
  }

  /** Tier 1: same type and the same normalized name or alias. */
  async findExact(m: EntityManager, userId: string, e: ExtractedEntity): Promise<string | null> {
    const key = normalizeEntityName(e.name, e.type);
    const [row] = (await m.query(
      `SELECT id FROM entities
       WHERE user_id = $1 AND type = $2 AND merged_into_id IS NULL AND (normalized_name = $3 OR $3 = ANY(normalized_aliases))
       ORDER BY (normalized_name = $3) DESC, created_at LIMIT 1`,
      [userId, e.type, key],
    )) as { id: string }[];
    return row?.id ?? null;
  }

  /**
   * Resolves one extracted entity to an entity id, creating it when no tier claims it.
   * `embedding` is only needed (and only computed by the caller) when tier 1 missed.
   */
  async resolve(m: EntityManager, userId: string, e: ExtractedEntity, embedding: number[] | undefined): Promise<string> {
    const exact = await this.findExact(m, userId, e);
    if (exact) {
      if (e.description) {
        await m.query('UPDATE entities SET description = $2 WHERE id = $1 AND description IS NULL AND is_user_edited = false', [exact, e.description]);
      }
      return exact;
    }
    if (!embedding) throw new Error(`resolve: new ${e.type} entity arrived without an embedding`);
    const neighbours = await this.neighbours(m, userId, e.type, embedding, null);

    const auto = this.options.autoMergeThreshold;
    if (auto !== null && neighbours[0] && neighbours[0].similarity >= auto) {
      await this.addAlias(m, neighbours[0].id, e);
      return neighbours[0].id;
    }

    const [created] = (await m.query(
      `INSERT INTO entities (user_id, canonical_name, normalized_name, type, description, aliases, embedding)
       VALUES ($1, $2, $3, $4, $5, '{}', $6) RETURNING id`,
      [userId, e.name, normalizeEntityName(e.name, e.type), e.type, e.description, pgvector.toSql(embedding)],
    )) as { id: string }[];
    for (const n of neighbours.filter((x) => x.similarity >= this.options.suggestThreshold)) {
      await this.suggest(m, userId, created.id, n.id, n.similarity);
    }
    return created.id;
  }

  /** Tier 2 candidates: same user and type, not merged, closest first (exact scan — see search). */
  private async neighbours(m: EntityManager, userId: string, type: EntityType, embedding: number[], excludeId: string | null) {
    return (await m.query(
      `SELECT id, 1 - (embedding <=> $3) AS similarity FROM entities
       WHERE user_id = $1 AND type = $2 AND merged_into_id IS NULL AND ($4::uuid IS NULL OR id <> $4)
       ORDER BY (embedding <=> $3) + 0, id LIMIT $5`,
      [userId, type, pgvector.toSql(embedding), excludeId, this.options.maxSuggestions],
    )) as { id: string; similarity: number }[];
  }

  private async addAlias(m: EntityManager, id: string, e: ExtractedEntity): Promise<void> {
    await m.query(
      `UPDATE entities SET aliases = array_append(aliases, $2), normalized_aliases = array_append(normalized_aliases, $3)
       WHERE id = $1 AND is_user_edited = false AND NOT ($2 = ANY(aliases))`,
      [id, e.name, normalizeEntityName(e.name, e.type)],
    );
  }

  /** A pair the user already rejected is never proposed again (US-40). */
  private async suggest(m: EntityManager, userId: string, x: string, y: string, score: number): Promise<void> {
    const [a, b] = x < y ? [x, y] : [y, x];
    await m.query(
      `INSERT INTO entity_merge_suggestions (user_id, entity_a_id, entity_b_id, score)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM entity_merge_rejections WHERE user_id = $1 AND entity_a_id = $2 AND entity_b_id = $3)
       ON CONFLICT (user_id, entity_a_id, entity_b_id) DO NOTHING`,
      [userId, a, b, score],
    );
  }
}
