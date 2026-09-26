import type { DataSource } from 'typeorm';
import { ProcessingStep } from '@meetio/shared';
import type { PipelineStepHandler, StepContext } from '../pipeline/pipeline-step-handler.js';
import type { GeminiClient } from '../ai/gemini.client.js';
import type { ChunkExtraction } from './extraction-schema.js';
import { EntityResolver, entityEmbeddingText, type ExtractedEntity } from './entity-resolver.js';

/**
 * Pipeline step `resolve`: attaches each chunk's extracted entities to the user's graph
 * (docs/system-architecture.md §5) and records the mentions and relations that cite the chunk.
 *
 * One transaction per chunk, holding the user's graph lock, ending with `resolved_at` — a retry
 * resumes at the first unresolved chunk and never writes a mention twice. Names tier 1 cannot
 * place are embedded before the transaction (one call per chunk) so the lock is never held
 * across a network call. Finally, entities no mention refers to any more (their chunks were
 * re-cut by an edit) are removed unless the user edited them.
 */
export class ResolveStepHandler implements PipelineStepHandler {
  readonly step = ProcessingStep.RESOLVE;

  constructor(
    private readonly dataSource: DataSource,
    private readonly gemini: GeminiClient,
    private readonly resolver: EntityResolver,
  ) {}

  async run(ctx: StepContext): Promise<void> {
    for (;;) {
      if (ctx.signal.aborted) return;
      const [chunk] = (await this.dataSource.query(
        `SELECT id, extraction FROM meeting_chunks WHERE meeting_id = $1 AND extracted_at IS NOT NULL AND resolved_at IS NULL
         ORDER BY segment_start_seq, id LIMIT 1`,
        [ctx.meetingId],
      )) as { id: string; extraction: ChunkExtraction | null }[];
      if (!chunk) break;
      await this.resolveChunk(ctx, chunk.id, chunk.extraction ?? { entities: [], relations: [] });
    }
    await this.dataSource.transaction(async (m) => {
      await EntityResolver.lockUserGraph(m, ctx.userId);
      await m.query(
        `DELETE FROM entities e WHERE e.user_id = $1 AND e.merged_into_id IS NULL AND e.is_user_edited = false
         AND NOT EXISTS (SELECT 1 FROM entity_mentions em WHERE em.entity_id = e.id)
         AND NOT EXISTS (SELECT 1 FROM entities child WHERE child.merged_into_id = e.id)`,
        [ctx.userId],
      );
    });
  }

  private async resolveChunk(
    ctx: StepContext,
    chunkId: string,
    extraction: ChunkExtraction,
  ): Promise<void> {
    const vectors = await this.embedUnplaced(ctx, extraction.entities);
    await this.dataSource.transaction(async (m) => {
      await EntityResolver.lockUserGraph(m, ctx.userId);
      const ids = new Map<string, string>();
      for (const e of extraction.entities) {
        const id = await this.resolver.resolve(m, ctx.userId, e, vectors.get(e.name));
        ids.set(e.name, id);
        await m.query(
          `INSERT INTO entity_mentions (entity_id, meeting_id, chunk_id, surface_form) VALUES ($1, $2, $3, $4)`,
          [id, ctx.meetingId, chunkId, e.name],
        );
      }
      for (const r of extraction.relations) {
        const [source, target] = [ids.get(r.source), ids.get(r.target)];
        // Two names of one entity ("Bình" → "anh Bình") would make a self-loop: not a relation.
        if (!source || !target || source === target) continue;
        await m.query(
          `INSERT INTO relations (user_id, source_entity_id, target_entity_id, relationship, meeting_id, chunk_id, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ctx.userId, source, target, r.relationship, ctx.meetingId, chunkId, r.confidence],
        );
      }
      await m.query('UPDATE meeting_chunks SET resolved_at = now() WHERE id = $1', [chunkId]);
    });
  }

  /** Embeds the names tier 1 does not already know. A name another meeting creates meanwhile simply wastes its vector. */
  private async embedUnplaced(
    ctx: StepContext,
    entities: ExtractedEntity[],
  ): Promise<Map<string, number[]>> {
    const unplaced: ExtractedEntity[] = [];
    for (const e of entities) {
      if (!(await this.resolver.findExact(this.dataSource.manager, ctx.userId, e)))
        unplaced.push(e);
    }
    if (unplaced.length === 0) return new Map();
    const { vectors } = await this.gemini.embed({
      userId: ctx.userId,
      meetingId: ctx.meetingId,
      operation: 'resolve',
      texts: unplaced.map(entityEmbeddingText),
      taskType: 'SEMANTIC_SIMILARITY',
      signal: ctx.signal,
    });
    return new Map(unplaced.map((e, i) => [e.name, vectors[i]]));
  }
}
