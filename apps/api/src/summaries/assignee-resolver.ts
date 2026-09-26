import type { EntityManager } from 'typeorm';
import { normalizeEntityName } from '../graph/name-normalizer.js';

/**
 * Maps a name the transcript states for a task to a person entity (phase-14 step 5): the person
 * must be mentioned in this same meeting and the name must match exactly one of them by the tier-1
 * key (name or alias). Anything else — unknown, ambiguous, no name — is null. OQ-02: an empty
 * assignee is better than a wrong one.
 */
export async function resolveAssignee(m: EntityManager, userId: string, meetingId: string, name: string | null): Promise<string | null> {
  if (!name) return null;
  const key = normalizeEntityName(name, 'person');
  if (!key) return null;
  const rows = (await m.query(
    `SELECT DISTINCT e.id FROM entities e JOIN entity_mentions em ON em.entity_id = e.id
     WHERE e.user_id = $1 AND em.meeting_id = $2 AND e.type = 'person' AND e.merged_into_id IS NULL
       AND (e.normalized_name = $3 OR $3 = ANY(e.normalized_aliases))`,
    [userId, meetingId, key],
  )) as { id: string }[];
  return rows.length === 1 ? rows[0].id : null;
}
