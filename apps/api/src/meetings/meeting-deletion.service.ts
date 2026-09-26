import { EntityResolver } from '../graph/entity-resolver.js';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { MeetingsRepository } from './meetings.repository.js';

/**
 * `DELETE /meetings/:id` — a physical delete (US-26 "xóa hẳn", clarifications
 * 2026-09-25), not the retention job's soft delete.
 *
 * One transaction:
 * 1. Lock the meeting (blocks in-flight segment writes; they fail with
 *    MEETING_NOT_FOUND once this commits).
 * 2. Remember which entities this meeting mentions.
 * 3. Delete the meeting — FK `ON DELETE CASCADE` removes segments, chunks,
 *    mentions, relations, action items, QA messages and jobs
 *    (docs/data-model.md §7). Cascades live in the schema, so a table added
 *    later is covered by its own FK, not by a list someone must remember here.
 * 4. Delete those entities that no mention anywhere refers to any more.
 *    Only entities this meeting mentioned are candidates — an entity with no
 *    mentions for some other reason is not this delete's business.
 */
@Injectable()
export class MeetingDeletionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly meetings: MeetingsRepository,
  ) {}

  async delete(id: string, userId: string): Promise<{ orphanedEntitiesDeleted: number }> {
    return this.dataSource.transaction(async (manager) => {
      // Graph lock first, like every other graph writer (resolve, merge, undo, edit): otherwise a
      // concurrent resolve could attach a new mention to an entity this delete then removes as
      // orphaned. Resolve takes the same lock before touching the meeting row, so no deadlock.
      await EntityResolver.lockUserGraph(manager, userId);
      await this.meetings.lockOwned(manager, id, userId);

      const mentioned = (await manager.query(
        'SELECT DISTINCT entity_id FROM entity_mentions WHERE meeting_id = $1',
        [id],
      )) as { entity_id: string }[];

      await manager.query('DELETE FROM meetings WHERE id = $1 AND user_id = $2', [id, userId]);

      if (mentioned.length === 0) {
        return { orphanedEntitiesDeleted: 0 };
      }
      const [, deleted] = (await manager.query(
        // What was merged into an orphan goes with it — otherwise `merged_into_id` would be
        // nulled by the FK and those names would reappear as live, mention-less entities.
        `WITH orphans AS (
           SELECT e.id FROM entities e
           WHERE e.user_id = $1 AND e.id = ANY($2::uuid[])
             AND NOT EXISTS (SELECT 1 FROM entity_mentions m WHERE m.entity_id = e.id)
         )
         DELETE FROM entities e WHERE e.user_id = $1 AND (e.id IN (SELECT id FROM orphans) OR e.merged_into_id IN (SELECT id FROM orphans))`,
        [userId, mentioned.map((r) => r.entity_id)],
      )) as [unknown, number];
      return { orphanedEntitiesDeleted: deleted };
    });
  }
}
