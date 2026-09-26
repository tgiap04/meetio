import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ApiErrorCode, type EntityDetail, type MergeEntitiesResponse } from '@meetio/shared';
import { EntityResolver } from './entity-resolver.js';
import { EntityQueryService } from './entity-query.service.js';
import { entityNotFound } from './graph-sql.js';

interface LiveEntity {
  id: string;
  canonical_name: string;
  normalized_name: string;
  aliases: string[];
  normalized_aliases: string[];
}

/** Everything a merge moved, so undo can put exactly that back (US-40: split again within 30 days). */
interface MergeSnapshot {
  canonical_name: string;
  added_aliases: string[];
  added_normalized_aliases: string[];
  mention_ids: string[];
  source_relation_ids: string[];
  target_relation_ids: string[];
  /** Relations between the two that would have become self-loops — removed, restored on undo. */
  dropped_relations: Record<string, unknown>[];
  child_ids: string[];
}

const rows = async <T>(m: EntityManager, sql: string, params: unknown[]): Promise<T[]> =>
  // UPDATE/DELETE … RETURNING comes back from TypeORM's pg driver as [rows, affected].
  ((await m.query(sql, params)) as [T[], number])[0];

@Injectable()
export class EntityMergeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly query: EntityQueryService,
  ) {}

  async merge(userId: string, keepId: string, mergeIds: string[]): Promise<MergeEntitiesResponse> {
    if (mergeIds.includes(keepId)) throw entityNotFound();
    return this.dataSource.transaction(async (m) => {
      await EntityResolver.lockUserGraph(m, userId);
      const live = (await m.query(
        `SELECT id, canonical_name, normalized_name, aliases, normalized_aliases FROM entities
         WHERE user_id = $1 AND merged_into_id IS NULL AND id = ANY($2::uuid[]) FOR UPDATE`,
        [userId, [keepId, ...mergeIds]],
      )) as LiveEntity[];
      if (live.length !== mergeIds.length + 1) throw entityNotFound();
      const keep = live.find((e) => e.id === keepId)!;

      const merges: string[] = [];
      for (const merged of live.filter((e) => e.id !== keepId)) merges.push(await this.mergeOne(m, userId, keep, merged));
      await m.query('UPDATE entities SET is_user_edited = true, updated_at = now() WHERE id = $1', [keepId]);
      const entity = await this.query.detail(userId, keepId, m);
      return { entity, merges: entity.merges.filter((r) => merges.includes(r.id)) };
    });
  }

  private async mergeOne(m: EntityManager, userId: string, keep: LiveEntity, merged: LiveEntity): Promise<string> {
    const names = [merged.canonical_name, ...merged.aliases].filter((a) => a !== keep.canonical_name && !keep.aliases.includes(a));
    const norms = [merged.normalized_name, ...merged.normalized_aliases].filter((a) => a !== keep.normalized_name && !keep.normalized_aliases.includes(a));
    keep.aliases.push(...names);
    keep.normalized_aliases.push(...norms);

    const dropped = await rows<Record<string, unknown>>(
      m,
      `DELETE FROM relations WHERE (source_entity_id = $1 AND target_entity_id = $2) OR (source_entity_id = $2 AND target_entity_id = $1)
       RETURNING id, user_id, source_entity_id, target_entity_id, relationship, meeting_id, chunk_id, confidence, created_at`,
      [keep.id, merged.id],
    );
    const ids = (sql: string) => rows<{ id: string }>(m, sql, [keep.id, merged.id]).then((r) => r.map((x) => x.id));
    const snapshot: MergeSnapshot = {
      canonical_name: merged.canonical_name,
      added_aliases: names,
      added_normalized_aliases: norms,
      dropped_relations: dropped,
      mention_ids: await ids('UPDATE entity_mentions SET entity_id = $1 WHERE entity_id = $2 RETURNING id'),
      source_relation_ids: await ids('UPDATE relations SET source_entity_id = $1 WHERE source_entity_id = $2 RETURNING id'),
      target_relation_ids: await ids('UPDATE relations SET target_entity_id = $1 WHERE target_entity_id = $2 RETURNING id'),
      child_ids: await ids('UPDATE entities SET merged_into_id = $1 WHERE merged_into_id = $2 RETURNING id'),
    };
    await m.query('UPDATE entities SET aliases = $2, normalized_aliases = $3, updated_at = now() WHERE id = $1', [keep.id, keep.aliases, keep.normalized_aliases]);
    await m.query('UPDATE entities SET merged_into_id = $1, updated_at = now() WHERE id = $2', [keep.id, merged.id]);
    await m.query('DELETE FROM entity_merge_suggestions WHERE entity_a_id = $1 OR entity_b_id = $1', [merged.id]);
    const [{ id }] = (await m.query(`INSERT INTO entity_merges (user_id, keep_id, merged_id, snapshot) VALUES ($1, $2, $3, $4) RETURNING id`, [
      userId,
      keep.id,
      merged.id,
      JSON.stringify(snapshot),
    ])) as { id: string }[];
    return id;
  }

  /**
   * Splits a merge back out. Only what the merge moved goes back — mentions found for the kept
   * entity since then stay with it. Refused after 30 days, twice, or once the merged entity has
   * since been folded into something else.
   */
  async undo(userId: string, mergeId: string): Promise<EntityDetail> {
    return this.dataSource.transaction(async (m) => {
      await EntityResolver.lockUserGraph(m, userId);
      const [rec] = (await m.query(
        `SELECT g.keep_id, g.merged_id, g.snapshot, g.undone_at, g.created_at > now() - interval '30 days' AS in_window,
                e.merged_into_id = g.keep_id AS still_merged
         FROM entity_merges g JOIN entities e ON e.id = g.merged_id WHERE g.id = $1 AND g.user_id = $2 FOR UPDATE OF g`,
        [mergeId, userId],
      )) as { keep_id: string; merged_id: string; snapshot: MergeSnapshot; undone_at: Date | null; in_window: boolean; still_merged: boolean }[];
      if (!rec) throw entityNotFound();
      if (rec.undone_at || !rec.in_window || !rec.still_merged) {
        throw new ConflictException({
          code: ApiErrorCode.INVALID_STATE_TRANSITION,
          message: rec.undone_at ? 'Lần gộp này đã được tách lại' : !rec.in_window ? 'Đã quá 30 ngày, không tách lại được' : 'Thực thể đã được gộp tiếp vào nơi khác',
          details: {},
        });
      }
      const { keep_id: keep, merged_id: merged, snapshot: s } = rec;
      await m.query('UPDATE entities SET merged_into_id = NULL, updated_at = now() WHERE id = $1', [merged]);
      await m.query('UPDATE entity_mentions SET entity_id = $2 WHERE entity_id = $1 AND id = ANY($3::uuid[])', [keep, merged, s.mention_ids]);
      await m.query('UPDATE relations SET source_entity_id = $2 WHERE source_entity_id = $1 AND id = ANY($3::uuid[])', [keep, merged, s.source_relation_ids]);
      await m.query('UPDATE relations SET target_entity_id = $2 WHERE target_entity_id = $1 AND id = ANY($3::uuid[])', [keep, merged, s.target_relation_ids]);
      await m.query('UPDATE entities SET merged_into_id = $2 WHERE merged_into_id = $1 AND id = ANY($3::uuid[])', [keep, merged, s.child_ids]);
      await m.query(
        `INSERT INTO relations (id, user_id, source_entity_id, target_entity_id, relationship, meeting_id, chunk_id, confidence, created_at)
         SELECT r.id, r.user_id, r.source_entity_id, r.target_entity_id, r.relationship, r.meeting_id, r.chunk_id, r.confidence, r.created_at
         FROM jsonb_populate_recordset(NULL::relations, $1::jsonb) r
         WHERE EXISTS (SELECT 1 FROM meeting_chunks c WHERE c.id = r.chunk_id)
           AND EXISTS (SELECT 1 FROM entities x WHERE x.id = r.source_entity_id) AND EXISTS (SELECT 1 FROM entities y WHERE y.id = r.target_entity_id)`,
        [JSON.stringify(s.dropped_relations)],
      );
      await m.query(
        `UPDATE entities SET aliases = array(SELECT a FROM unnest(aliases) a WHERE NOT (a = ANY($2::text[]))),
                normalized_aliases = array(SELECT a FROM unnest(normalized_aliases) a WHERE NOT (a = ANY($3::text[]))), updated_at = now()
         WHERE id = $1`,
        [keep, s.added_aliases, s.added_normalized_aliases],
      );
      await m.query('UPDATE entity_merges SET undone_at = now() WHERE id = $1', [mergeId]);
      return this.query.detail(userId, keep, m);
    });
  }
}
