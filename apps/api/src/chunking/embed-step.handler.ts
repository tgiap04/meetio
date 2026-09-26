import type { DataSource } from 'typeorm';
import pgvector from 'pgvector/pg';
import { ProcessingStep } from '@meetio/shared';
import type { PipelineStepHandler, StepContext } from '../pipeline/pipeline-step-handler.js';
import type { GeminiClient } from '../ai/gemini.client.js';

/** phase-12 step 3: 20 chunks per Gemini embed call. */
export const EMBED_BATCH = 20;

/**
 * Pipeline step `embed`: fills the embedding and the real token count of
 * every chunk that has none yet. Each batch commits on its own, so a retry
 * after a failure resumes where the last committed batch ended instead of
 * paying for the whole meeting again.
 */
export class EmbedStepHandler implements PipelineStepHandler {
  readonly step = ProcessingStep.EMBED;

  constructor(
    private readonly dataSource: DataSource,
    private readonly gemini: GeminiClient,
  ) {}

  async run(ctx: StepContext): Promise<void> {
    for (;;) {
      if (ctx.signal.aborted) return;
      const batch = (await this.dataSource.query(
        `SELECT id, content FROM meeting_chunks WHERE meeting_id = $1 AND embedding IS NULL ORDER BY segment_start_seq, id LIMIT $2`,
        [ctx.meetingId, EMBED_BATCH],
      )) as { id: string; content: string }[];
      if (batch.length === 0) return;

      const { vectors, tokenCounts } = await this.gemini.embed({
        userId: ctx.userId,
        meetingId: ctx.meetingId,
        operation: 'embed',
        texts: batch.map((c) => c.content),
        taskType: 'RETRIEVAL_DOCUMENT',
        signal: ctx.signal,
      });
      await this.dataSource.transaction(async (m) => {
        for (let i = 0; i < batch.length; i++) {
          await m.query('UPDATE meeting_chunks SET embedding = $2, token_count = $3 WHERE id = $1', [
            batch[i].id,
            pgvector.toSql(vectors[i]),
            tokenCounts[i],
          ]);
        }
      });
    }
  }
}
