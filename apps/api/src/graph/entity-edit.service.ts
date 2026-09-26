import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityDetail } from '@meetio/shared';
import type { UpdateEntityDto } from './dto/graph.dto.js';
import { EntityResolver } from './entity-resolver.js';
import { EntityQueryService } from './entity-query.service.js';
import { entityNotFound } from './graph-sql.js';
import { normalizeEntityName } from './name-normalizer.js';

/** US-41 edits and US-40 rejections. The user's word is final: an edited entity is never rewritten by the pipeline. */
@Injectable()
export class EntityEditService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly query: EntityQueryService,
  ) {}

  /** Renames keep the old name as an alias, so it is still found and still matched on the next run. */
  async update(userId: string, id: string, dto: UpdateEntityDto): Promise<EntityDetail> {
    return this.dataSource.transaction(async (m) => {
      await EntityResolver.lockUserGraph(m, userId);
      const [e] = (await m.query(
        'SELECT canonical_name, type, aliases FROM entities WHERE id = $1 AND user_id = $2 AND merged_into_id IS NULL FOR UPDATE',
        [id, userId],
      )) as { canonical_name: string; type: string; aliases: string[] }[];
      if (!e) throw entityNotFound();

      const name = dto.canonical_name?.trim() || e.canonical_name;
      const type = dto.type ?? e.type;
      const renamed = name !== e.canonical_name;
      const aliases = renamed && !e.aliases.includes(e.canonical_name) ? [...e.aliases, e.canonical_name] : e.aliases.filter((a) => a !== name);
      await m.query(
        `UPDATE entities SET canonical_name = $3, type = $4, normalized_name = $5, aliases = $6, normalized_aliases = $7,
                is_user_edited = true, updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [id, userId, name, type, normalizeEntityName(name, type), aliases, aliases.map((a) => normalizeEntityName(a, type))],
      );
      return this.query.detail(userId, id, m);
    });
  }

  /** Deletes the entity, what was merged into it, and — by cascade — its mentions, relations and suggestions. */
  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      await EntityResolver.lockUserGraph(m, userId);
      const [owned] = await m.query('SELECT 1 FROM entities WHERE id = $1 AND user_id = $2 AND merged_into_id IS NULL', [id, userId]);
      if (!owned) throw entityNotFound();
      await m.query('DELETE FROM entities WHERE user_id = $2 AND (merged_into_id = $1 OR id = $1)', [id, userId]);
    });
  }

  /** "Not the same": remembered forever (per pair), so the vector tier never proposes it again. */
  async rejectSuggestion(userId: string, suggestionId: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      // UPDATE/DELETE … RETURNING comes back from TypeORM's pg driver as [rows, affected].
      const [[s]] = (await m.query('DELETE FROM entity_merge_suggestions WHERE id = $1 AND user_id = $2 RETURNING entity_a_id, entity_b_id', [
        suggestionId,
        userId,
      ])) as [{ entity_a_id: string; entity_b_id: string }[], number];
      if (!s) throw entityNotFound();
      await m.query(
        `INSERT INTO entity_merge_rejections (user_id, entity_a_id, entity_b_id) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, entity_a_id, entity_b_id) DO NOTHING`,
        [userId, s.entity_a_id, s.entity_b_id],
      );
    });
  }
}
