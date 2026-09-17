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
}
