import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import pgvector from 'pgvector/pg';
import { MeetingChunk } from './entities/meeting-chunk.entity.js';
import { EntityRecord } from './entities/entity-record.entity.js';

export interface SimilarChunkResult {
  id: string;
  meetingId: string;
  content: string;
  distance: number;
}

export interface ChunkSearchFilter {
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface ChunkSearchRow {
  chunkId: string;
  meetingId: string;
  meetingTitle: string;
  meetingStartedAt: Date | null;
  content: string;
  segmentStartSeq: number;
  segmentEndSeq: number;
  distance: number;
}

export interface SimilarEntityResult {
  id: string;
  canonicalName: string;
  distance: number;
}

/**
 * The ONLY place in apps/api/src that is allowed to use the pgvector `<=>`
 * (cosine distance) operator — see phase-02-database-schema.md step 8 and
 * its acceptance criterion "grep the whole tree for `<=>`, only this file
 * shows up". `find()` cannot express this ordering, so every method here
 * goes through QueryBuilder with the operator written as a raw string and
 * the query vector bound via `pgvector.toSql()`.
 *
 * `user_id` filtering happens INSIDE the query (never via a join back to
 * `meetings`) so the HNSW index stays effective — see docs/data-model.md §3.
 */
@Injectable()
export class VectorRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findSimilarChunks(userId: string, embedding: number[], limit = 10): Promise<SimilarChunkResult[]> {
    if (!userId) {
      throw new Error('findSimilarChunks requires a userId to scope the search');
    }
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('findSimilarChunks requires a non-empty embedding vector');
    }

    const rows = await this.dataSource
      .getRepository(MeetingChunk)
      .createQueryBuilder('chunk')
      .select('chunk.id', 'id')
      .addSelect('chunk.meeting_id', 'meetingId')
      .addSelect('chunk.content', 'content')
      .addSelect('chunk.embedding <=> :embedding', 'distance')
      .where('chunk.user_id = :userId')
      .orderBy('chunk.embedding <=> :embedding')
      .limit(limit)
      .setParameters({ userId, embedding: pgvector.toSql(embedding) })
      .getRawMany<{ id: string; meetingId: string; content: string; distance: string }>();

    return rows.map((row) => ({
      id: row.id,
      meetingId: row.meetingId,
      content: row.content,
      distance: Number(row.distance),
    }));
  }

  async findSimilarEntities(userId: string, embedding: number[], limit = 10): Promise<SimilarEntityResult[]> {
    if (!userId) {
      throw new Error('findSimilarEntities requires a userId to scope the search');
    }
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('findSimilarEntities requires a non-empty embedding vector');
    }

    const rows = await this.dataSource
      .getRepository(EntityRecord)
      .createQueryBuilder('entity')
      .select('entity.id', 'id')
      .addSelect('entity.canonical_name', 'canonicalName')
      .addSelect('entity.embedding <=> :embedding', 'distance')
      .where('entity.user_id = :userId')
      .andWhere('entity.merged_into_id IS NULL')
      .orderBy('entity.embedding <=> :embedding')
      .limit(limit)
      .setParameters({ userId, embedding: pgvector.toSql(embedding) })
      .getRawMany<{ id: string; canonicalName: string; distance: string }>();

    return rows.map((row) => ({
      id: row.id,
      canonicalName: row.canonicalName,
      distance: Number(row.distance),
    }));
  }

  /**
   * Semantic search for `GET /search` (US-22) — EXACT nearest neighbours
   * within the caller's own chunks, not an approximate HNSW scan.
   *
   * Every search is restricted to one user, and a global HNSW index serves a
   * selective filter badly: the index walk returns the nearest vectors of
   * *everyone*, the WHERE clause throws most away, and even with pgvector 0.8's
   * iterative scan a scan budget spent on other users' rows — or on dead index
   * entries left by chunk reconciliation until VACUUM — comes back short or
   * empty (measured in phase 12: an empty page for a user whose data was there).
   * Ordering by `(embedding <=> q) + 0` keeps the planner off the HNSW index,
   * so it reads the user's rows via `idx_chunks_user` and sorts exactly.
   * Measured: well under the 2s budget at 7,500 and 50,000 chunks for one user.
   *
   * Owner, soft-delete and date filters all live in this one statement.
   */
  async searchChunks(userId: string, embedding: number[], filter: ChunkSearchFilter): Promise<ChunkSearchRow[]> {
    if (!userId) {
      throw new Error('searchChunks requires a userId to scope the search');
    }
    const params: unknown[] = [pgvector.toSql(embedding), userId, filter.limit, filter.offset];
    const range: string[] = [];
    if (filter.from) range.push(`AND m.started_at >= $${params.push(filter.from)}`);
    if (filter.to) range.push(`AND m.started_at <= $${params.push(filter.to)}`);

    const rows = (await this.dataSource.query(
      `SELECT c.id AS "chunkId", c.meeting_id AS "meetingId", m.title AS "meetingTitle", m.started_at AS "meetingStartedAt",
              c.content, c.segment_start_seq AS "segmentStartSeq", c.segment_end_seq AS "segmentEndSeq",
              c.embedding <=> $1 AS distance
       FROM meeting_chunks c JOIN meetings m ON m.id = c.meeting_id
       WHERE c.user_id = $2 AND c.embedding IS NOT NULL AND m.deleted_at IS NULL ${range.join(' ')}
       ORDER BY (c.embedding <=> $1) + 0, c.id
       LIMIT $3 OFFSET $4`,
      params,
    )) as (Omit<ChunkSearchRow, 'distance'> & { distance: string })[];
    return rows.map((r) => ({ ...r, distance: Number(r.distance) }));
  }
}
