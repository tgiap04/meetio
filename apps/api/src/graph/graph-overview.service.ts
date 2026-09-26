import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiErrorCode, type MeetingGraphResponse, type MergeSuggestionsResponse } from '@meetio/shared';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import { ENTITY_SUMMARY_SELECT, toSummary, type EntitySummaryRow } from './graph-sql.js';

/** Screen 10's per-meeting graph and the merge-review queue (US-38, US-40). */
@Injectable()
export class GraphOverviewService {
  constructor(private readonly dataSource: DataSource) {}

  async meetingGraph(userId: string, meetingId: string): Promise<MeetingGraphResponse> {
    const [owned] = await this.dataSource.query('SELECT 1 FROM meetings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [meetingId, userId]);
    if (!owned) throw new OwnershipViolationException(ApiErrorCode.MEETING_NOT_FOUND, 'Không tìm thấy cuộc họp');

    const [nodes, edges] = await Promise.all([
      this.dataSource.query(
        `SELECT e.id, e.canonical_name, e.type, count(*)::int AS mention_count
         FROM entity_mentions em JOIN entities e ON e.id = em.entity_id
         WHERE em.meeting_id = $1 AND e.user_id = $2 GROUP BY e.id ORDER BY mention_count DESC, e.canonical_name, e.id`,
        [meetingId, userId],
      ),
      this.dataSource.query(
        `SELECT DISTINCT ON (r.source_entity_id, r.target_entity_id, r.relationship)
                r.source_entity_id AS source_id, r.target_entity_id AS target_id, r.relationship,
                count(*) OVER (PARTITION BY r.source_entity_id, r.target_entity_id, r.relationship)::int AS count,
                r.chunk_id, c.segment_start_seq AS segment_seq
         FROM relations r JOIN meeting_chunks c ON c.id = r.chunk_id
         WHERE r.meeting_id = $1 AND r.user_id = $2
         ORDER BY r.source_entity_id, r.target_entity_id, r.relationship, c.segment_start_seq, r.id`,
        [meetingId, userId],
      ),
    ]);
    return { nodes, edges };
  }

  async suggestions(userId: string): Promise<MergeSuggestionsResponse> {
    const rows = (await this.dataSource.query(
      `SELECT id, entity_a_id, entity_b_id, score FROM entity_merge_suggestions s
       WHERE s.user_id = $1
         AND EXISTS (
           SELECT 1 FROM entities a JOIN entities b ON b.id = s.entity_b_id
           WHERE a.id = s.entity_a_id AND a.merged_into_id IS NULL AND b.merged_into_id IS NULL
             AND a.type = b.type -- a later type edit makes the pair moot
         )
       ORDER BY score DESC, created_at, id LIMIT 50`,
      [userId],
    )) as { id: string; entity_a_id: string; entity_b_id: string; score: number }[];
    if (rows.length === 0) return { items: [] };

    const ids = [...new Set(rows.flatMap((r) => [r.entity_a_id, r.entity_b_id]))];
    const summaries = (await this.dataSource.query(`${ENTITY_SUMMARY_SELECT} WHERE e.user_id = $1 AND e.id = ANY($2::uuid[]) GROUP BY e.id`, [
      userId,
      ids,
    ])) as EntitySummaryRow[];
    const byId = new Map(summaries.map((s) => [s.id, toSummary(s)]));
    return {
      items: rows.map((r) => ({ id: r.id, score: r.score, a: byId.get(r.entity_a_id)!, b: byId.get(r.entity_b_id)! })),
    };
  }
}
