import type { DataSource, EntityManager } from 'typeorm';
import type { QaCitation, QaFilters, QaMessage } from '@meetio/shared';

/** What is stored per citation: enough to show it even after the passage is gone. */
export type StoredCitation = Omit<QaCitation, 'available'>;

export const LOW_CONFIDENCE = 0.5;
export const HISTORY_PAGE = 50;

interface Row {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: StoredCitation[] | null;
  confidence: number | null;
  not_found: boolean;
  filters: QaFilters | null;
  created_at: Date;
}

/**
 * Reads a thread (one meeting, or the global thread when `meetingId` is null) as wire messages.
 * A citation whose chunk no longer exists — the transcript was edited and re-cut — is kept but
 * marked unavailable instead of leading to the wrong place.
 */
export async function readThread(
  db: DataSource | EntityManager,
  userId: string,
  meetingId: string | null,
  opts: { limit?: number; before?: string | null; ids?: string[] } = {},
): Promise<{ items: QaMessage[]; next_before: string | null }> {
  const limit = opts.limit ?? HISTORY_PAGE;
  const rows = (await db.query(
    `SELECT id, role, content, citations, confidence, not_found, filters, created_at FROM qa_messages
     WHERE user_id = $1 AND meeting_id IS NOT DISTINCT FROM $2
       AND ($3::uuid IS NULL OR (created_at, id) < (SELECT created_at, id FROM qa_messages WHERE id = $3 AND user_id = $1))
       AND ($5::uuid[] IS NULL OR id = ANY($5::uuid[]))
     ORDER BY created_at DESC, id DESC LIMIT $4`,
    [userId, meetingId, opts.before ?? null, limit + 1, opts.ids ?? null],
  )) as Row[];
  const page = rows.slice(0, limit);
  const chunkIds = [...new Set(page.flatMap((r) => (r.citations ?? []).map((c) => c.chunk_id)))];
  const alive = new Set(
    chunkIds.length
      ? ((await db.query(
          `SELECT c.id FROM meeting_chunks c JOIN meetings m ON m.id = c.meeting_id AND m.deleted_at IS NULL WHERE c.id = ANY($1::uuid[]) AND c.user_id = $2`,
          [chunkIds, userId],
        )) as { id: string }[]).map((r) => r.id)
      : [],
  );
  return {
    items: page.reverse().map((r) => toMessage(r, alive)),
    next_before: rows.length > limit ? page[0].id : null,
  };
}

function toMessage(r: Row, alive: Set<string>): QaMessage {
  const assistant = r.role === 'assistant';
  const confidence = r.confidence === null ? null : Number(r.confidence);
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    citations: (r.citations ?? []).map((c) => ({ ...c, available: alive.has(c.chunk_id) })),
    confidence,
    not_found: r.not_found,
    low_confidence: assistant && !r.not_found && (confidence ?? 0) < LOW_CONFIDENCE,
    filters: r.filters,
    created_at: new Date(r.created_at).toISOString(),
  };
}
