import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { EntityDetail, EntityListResponse, EntityMergeRecord, EntityTimelineResponse } from '@meetio/shared';
import type { EntityListQueryDto, TimelineQueryDto } from './dto/graph.dto.js';
import { normalizeEntityName } from './name-normalizer.js';
import { ENTITY_SUMMARY_SELECT, entityNotFound, likeEscape, toSummary, type EntitySummaryRow } from './graph-sql.js';

const EXCERPT = 280;
const MERGE_UNDO_DAYS = 30;

/** Read side of the graph (api-spec §7). Every query is scoped to the caller and hides merged-away entities. */
@Injectable()
export class EntityQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async list(userId: string, q: EntityListQueryDto): Promise<EntityListResponse> {
    const limit = q.limit ?? 20;
    const offset = q.offset ?? 0;
    const needle = q.q ? likeEscape(normalizeEntityName(q.q, 'other')) : null;
    // Text with no letters or digits ("%", "…") normalizes to "" — which would match every name.
    if (needle === '') return { items: [], next_offset: null };
    const rows = (await this.dataSource.query(
      `${ENTITY_SUMMARY_SELECT}
       WHERE e.user_id = $1 AND e.merged_into_id IS NULL
         AND ($2::entity_type[] IS NULL OR e.type = ANY($2::entity_type[]))
         AND ($3::text IS NULL OR e.normalized_name LIKE '%' || $3 || '%'
              OR EXISTS (SELECT 1 FROM unnest(e.normalized_aliases) a WHERE a LIKE '%' || $3 || '%'))
       GROUP BY e.id
       ORDER BY mention_count DESC, e.canonical_name, e.id
       LIMIT $4 OFFSET $5`,
      [userId, q.type ? q.type.split(',') : null, needle, limit + 1, offset],
    )) as EntitySummaryRow[];
    return { items: rows.slice(0, limit).map(toSummary), next_offset: rows.length > limit ? offset + limit : null };
  }

  async detail(userId: string, id: string, m: EntityManager = this.dataSource.manager): Promise<EntityDetail> {
    const [row] = (await m.query(
      `${ENTITY_SUMMARY_SELECT.replace('e.aliases,', 'e.aliases, e.description, e.is_user_edited,')}
       WHERE e.user_id = $1 AND e.id = $2 AND e.merged_into_id IS NULL
       GROUP BY e.id`,
      [userId, id],
    )) as (EntitySummaryRow & { description: string | null; is_user_edited: boolean })[];
    if (!row) throw entityNotFound();

    const [relations, meetings, merges] = await Promise.all([
      m.query(
        `SELECT r.id, CASE WHEN r.source_entity_id = $2 THEN 'outgoing' ELSE 'incoming' END AS direction, r.relationship,
                json_build_object('id', o.id, 'canonical_name', o.canonical_name, 'type', o.type) AS other,
                r.confidence, r.meeting_id, mt.title AS meeting_title, r.chunk_id, c.segment_start_seq AS segment_seq
         FROM relations r
         JOIN entities o ON o.id = CASE WHEN r.source_entity_id = $2 THEN r.target_entity_id ELSE r.source_entity_id END
         JOIN meetings mt ON mt.id = r.meeting_id AND mt.deleted_at IS NULL
         JOIN meeting_chunks c ON c.id = r.chunk_id
         WHERE r.user_id = $1 AND (r.source_entity_id = $2 OR r.target_entity_id = $2)
         ORDER BY mt.started_at DESC NULLS LAST, c.segment_start_seq, r.id LIMIT 200`,
        [userId, id],
      ),
      m.query(
        `SELECT mt.id, mt.title, mt.started_at, count(*)::int AS mention_count
         FROM entity_mentions em JOIN meetings mt ON mt.id = em.meeting_id AND mt.deleted_at IS NULL
         WHERE em.entity_id = $1 GROUP BY mt.id ORDER BY mt.started_at DESC NULLS LAST, mt.id LIMIT 100`,
        [id],
      ),
      this.undoableMerges(m, userId, id),
    ]);
    return {
      ...toSummary(row),
      description: row.description,
      is_user_edited: row.is_user_edited,
      relations,
      meetings: meetings.map((x: { started_at: Date | null }) => ({ ...x, started_at: x.started_at ? new Date(x.started_at).toISOString() : null })),
      merges,
    };
  }

  async undoableMerges(m: EntityManager, userId: string, keepId: string): Promise<EntityMergeRecord[]> {
    const rows = (await m.query(
      `SELECT id, merged_id, snapshot->>'canonical_name' AS merged_name, created_at FROM entity_merges
       WHERE user_id = $1 AND keep_id = $2 AND undone_at IS NULL AND created_at > now() - make_interval(days => $3)
       ORDER BY created_at DESC`,
      [userId, keepId, MERGE_UNDO_DAYS],
    )) as { id: string; merged_id: string; merged_name: string; created_at: Date }[];
    return rows.map((r) => ({
      id: r.id,
      merged_entity_id: r.merged_id,
      merged_name: r.merged_name,
      merged_at: new Date(r.created_at).toISOString(),
      undo_until: new Date(new Date(r.created_at).getTime() + MERGE_UNDO_DAYS * 86_400_000).toISOString(),
    }));
  }

  /** US-39: every mention, oldest meeting first, then transcript order. */
  async timeline(userId: string, id: string, q: TimelineQueryDto): Promise<EntityTimelineResponse> {
    const limit = q.limit ?? 20;
    const offset = q.offset ?? 0;
    const [owned] = await this.dataSource.query('SELECT 1 FROM entities WHERE id = $1 AND user_id = $2 AND merged_into_id IS NULL', [id, userId]);
    if (!owned) throw entityNotFound();
    const rows = (await this.dataSource.query(
      `SELECT mt.id AS meeting_id, mt.title AS meeting_title, mt.started_at, c.id AS chunk_id, c.segment_start_seq AS segment_seq,
              em.surface_form, c.content
       FROM entity_mentions em
       JOIN meetings mt ON mt.id = em.meeting_id AND mt.deleted_at IS NULL
       JOIN meeting_chunks c ON c.id = em.chunk_id
       WHERE em.entity_id = $1
       ORDER BY mt.started_at ASC NULLS LAST, mt.id, c.segment_start_seq, em.id
       LIMIT $2 OFFSET $3`,
      [id, limit + 1, offset],
    )) as { meeting_id: string; meeting_title: string; started_at: Date | null; chunk_id: string; segment_seq: number; surface_form: string; content: string }[];
    return {
      items: rows.slice(0, limit).map(({ started_at, content, ...r }) => ({
        ...r,
        meeting_date: started_at ? new Date(started_at).toISOString() : null,
        excerpt: excerptAround(content, r.surface_form),
      })),
      next_offset: rows.length > limit ? offset + limit : null,
    };
  }
}

/** A window of the chunk centred on where the entity is named, so the timeline shows the context. */
export function excerptAround(content: string, surface: string): string {
  if (content.length <= EXCERPT) return content;
  const at = Math.max(0, content.toLowerCase().indexOf(surface.toLowerCase()));
  const start = Math.max(0, Math.min(at - Math.floor(EXCERPT / 3), content.length - EXCERPT));
  const cut = content.slice(start, start + EXCERPT);
  return `${start > 0 ? '…' : ''}${cut}${start + EXCERPT < content.length ? '…' : ''}`;
}
