import type { EntitySummary } from '@meetio/shared';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import { ApiErrorCode } from '@meetio/shared';

/**
 * Summary columns of a live entity. Mentions in soft-deleted meetings do not count. Expects
 * `entities e` in FROM and is closed by the caller's `GROUP BY e.id`.
 */
export const ENTITY_SUMMARY_SELECT = `
  SELECT e.id, e.canonical_name, e.type, e.aliases,
         count(mt.id)::int AS mention_count,
         count(DISTINCT mt.id)::int AS meeting_count,
         max(mt.started_at) AS last_mentioned_at
  FROM entities e
  LEFT JOIN entity_mentions em ON em.entity_id = e.id
  LEFT JOIN meetings mt ON mt.id = em.meeting_id AND mt.deleted_at IS NULL`;

export interface EntitySummaryRow extends Omit<EntitySummary, 'last_mentioned_at'> {
  last_mentioned_at: Date | null;
}

export const toSummary = (r: EntitySummaryRow): EntitySummary => ({
  id: r.id,
  canonical_name: r.canonical_name,
  type: r.type,
  aliases: r.aliases,
  mention_count: r.mention_count,
  meeting_count: r.meeting_count,
  last_mentioned_at: r.last_mentioned_at ? new Date(r.last_mentioned_at).toISOString() : null,
});

export const entityNotFound = () => new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy thực thể');

/** `%` and `_` in a user's search text are literal characters, not wildcards. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
