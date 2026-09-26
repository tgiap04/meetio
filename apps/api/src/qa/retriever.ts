import pgvector from 'pgvector/pg';
import type { DataSource } from 'typeorm';
import type { GeminiClient } from '../ai/gemini.client.js';
import { hasDiacritics, normalizeEntityName } from '../graph/name-normalizer.js';

/** What a question may draw on. Always one user; optionally one meeting, a date range, one entity. */
export interface QaScope {
  userId: string;
  meetingId: string | null;
  from: Date | null;
  to: Date | null;
  entityId: string | null;
}

export interface RetrievedChunk {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: Date | null;
  seq: number;
  content: string;
  /** Cosine similarity to the question, plus a small bonus for passages reached through the graph. */
  score: number;
  via: 'vector' | 'graph';
}

export interface Retrieval {
  chunks: RetrievedChunk[];
  /** Best plain vector similarity of any chunk — the "is there anything relevant at all" signal. */
  bestSimilarity: number;
  /** Entities the question names (or the scope's entity) — a second, independent relevance signal. */
  namedEntities: { id: string; name: string }[];
}

export const CHUNK_ANCHORS = 10;
export const ENTITY_ANCHORS = 5;
const GRAPH_CHUNKS = 20;
const GRAPH_BONUS = 0.05;
/** Entity names shorter than this ("an", "ai") would match inside ordinary words. */
const MIN_NAME_LENGTH = 3;

/**
 * Steps 1–3 of docs/system-architecture.md §4: embed the question, find anchors (chunks by vector,
 * entities by name and by vector), then expand one hop over the graph to the passages that stated
 * those entities' relations or mention them. Every query filters by user (and scope) inside SQL.
 * Chunk search scans exactly, like /search: HNSW + a per-user filter can return an empty page.
 */
export class Retriever {
  constructor(
    private readonly dataSource: DataSource,
    private readonly gemini: GeminiClient,
  ) {}

  async retrieve(scope: QaScope, query: string, signal: AbortSignal): Promise<Retrieval> {
    const attribution = { userId: scope.userId, meetingId: scope.meetingId, operation: 'qa', texts: [query], signal };
    const [{ vectors: [q] }, { vectors: [e] }] = await Promise.all([
      this.gemini.embed({ ...attribution, taskType: 'RETRIEVAL_QUERY' }),
      this.gemini.embed({ ...attribution, taskType: 'SEMANTIC_SIMILARITY' }),
    ]);
    const qSql = pgvector.toSql(q) as string;
    const [anchors, named] = await Promise.all([this.chunkAnchors(scope, qSql), this.entityAnchors(scope, query, pgvector.toSql(e) as string)]);
    const graph = named.length ? await this.expand(scope, qSql, named.map((n) => n.id)) : [];

    const byId = new Map<string, RetrievedChunk>();
    for (const c of [...anchors, ...graph]) {
      const prev = byId.get(c.id);
      if (!prev || c.score > prev.score) byId.set(c.id, c);
    }
    return {
      chunks: [...byId.values()].sort((a, b) => b.score - a.score),
      bestSimilarity: anchors.reduce((m, c) => Math.max(m, c.score), 0),
      namedEntities: named.filter((n) => n.byName).map(({ id, name }) => ({ id, name })),
    };
  }

  /** `$2..$6` = user, meeting, from, to, entity; `c` chunk, `m` meeting. */
  private static readonly SCOPE = `c.user_id = $2 AND c.embedding IS NOT NULL AND m.deleted_at IS NULL
      AND ($3::uuid IS NULL OR c.meeting_id = $3) AND ($4::timestamptz IS NULL OR m.started_at >= $4)
      AND ($5::timestamptz IS NULL OR m.started_at <= $5)
      AND ($6::uuid IS NULL OR EXISTS (SELECT 1 FROM entity_mentions em WHERE em.chunk_id = c.id AND em.entity_id = $6))`;
  private static readonly COLUMNS = `c.id, c.meeting_id AS "meetingId", m.title AS "meetingTitle", m.started_at AS "meetingDate",
      c.segment_start_seq AS seq, c.content, 1 - (c.embedding <=> $1) AS score`;
  private params(scope: QaScope, qSql: string) {
    return [qSql, scope.userId, scope.meetingId, scope.from, scope.to, scope.entityId];
  }

  private async chunkAnchors(scope: QaScope, qSql: string): Promise<RetrievedChunk[]> {
    const rows = (await this.dataSource.query(
      `SELECT ${Retriever.COLUMNS} FROM meeting_chunks c JOIN meetings m ON m.id = c.meeting_id
       WHERE ${Retriever.SCOPE} ORDER BY (c.embedding <=> $1) + 0, c.id LIMIT ${CHUNK_ANCHORS}`,
      this.params(scope, qSql),
    )) as Omit<RetrievedChunk, 'via'>[];
    return rows.map((r) => ({ ...r, score: Number(r.score), via: 'vector' }));
  }

  /** Named in the question first (the reliable signal for Vietnamese names), then nearest by vector. */
  private async entityAnchors(scope: QaScope, query: string, eSql: string) {
    const key = ` ${normalizeEntityName(query, 'other')} `;
    const rows = (await this.dataSource.query(
      `SELECT e.id, e.canonical_name AS name, e.aliases, e.type,
              ($3 LIKE '% ' || e.normalized_name || ' %' AND length(e.normalized_name) >= ${MIN_NAME_LENGTH})
              OR EXISTS (SELECT 1 FROM unnest(e.normalized_aliases) a WHERE length(a) >= ${MIN_NAME_LENGTH} AND $3 LIKE '% ' || a || ' %') AS "byName",
              1 - (e.embedding <=> $2) AS similarity
       FROM entities e
       WHERE e.user_id = $1 AND e.merged_into_id IS NULL
         AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM entity_mentions em WHERE em.entity_id = e.id AND em.meeting_id = $4))
       ORDER BY "byName" DESC, (e.embedding <=> $2) + 0, e.id LIMIT ${ENTITY_ANCHORS}`,
      [scope.userId, eSql, key, scope.meetingId],
    )) as { id: string; name: string; aliases: string[]; type: string; byName: boolean; similarity: number }[];
    // The SQL match ignores accents, so "cuối tuần" finds a person "Tuấn". Text typed with accents must
    // also match with them; text typed without accents can only match without.
    // Each line of the search text on its own terms (a follow-up is searched with the question before it).
    const parts = query.split('\n').map((line) => {
      const keepDiacritics = hasDiacritics(line);
      return { keepDiacritics, key: ` ${normalizeEntityName(line, 'other', { keepDiacritics })} ` };
    });
    const namedHere = (r: (typeof rows)[number]) =>
      parts.some((p) =>
        [r.name, ...r.aliases]
          .map((v) => normalizeEntityName(v, r.type, { keepDiacritics: p.keepDiacritics }))
          .some((v) => v.length >= MIN_NAME_LENGTH && p.key.includes(` ${v} `)),
      );
    const anchors = rows.filter((r) => r.byName && namedHere(r)).map(({ id, name, byName, similarity }) => ({ id, name, byName, similarity }));
    if (scope.entityId && !anchors.some((a) => a.id === scope.entityId)) {
      const [pinned] = (await this.dataSource.query('SELECT id, canonical_name AS name FROM entities WHERE id = $1 AND user_id = $2', [
        scope.entityId,
        scope.userId,
      ])) as { id: string; name: string }[];
      if (pinned) anchors.unshift({ ...pinned, byName: true, similarity: 1 });
    }
    return anchors.slice(0, ENTITY_ANCHORS);
  }

  /** One hop: passages that stated a relation of an anchor entity, or that mention it. */
  private async expand(scope: QaScope, qSql: string, entityIds: string[]): Promise<RetrievedChunk[]> {
    const rows = (await this.dataSource.query(
      `SELECT ${Retriever.COLUMNS} FROM meeting_chunks c JOIN meetings m ON m.id = c.meeting_id
       WHERE ${Retriever.SCOPE} AND c.id IN (
         SELECT r.chunk_id FROM relations r WHERE r.user_id = $2 AND (r.source_entity_id = ANY($7::uuid[]) OR r.target_entity_id = ANY($7::uuid[]))
         UNION SELECT em.chunk_id FROM entity_mentions em WHERE em.entity_id = ANY($7::uuid[]))
       ORDER BY (c.embedding <=> $1) + 0, c.id LIMIT ${GRAPH_CHUNKS}`,
      [...this.params(scope, qSql), entityIds],
    )) as Omit<RetrievedChunk, 'via'>[];
    return rows.map((r) => ({ ...r, score: Number(r.score) + GRAPH_BONUS, via: 'graph' }));
  }
}
