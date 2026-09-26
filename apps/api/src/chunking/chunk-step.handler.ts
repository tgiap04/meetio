import type { DataSource } from 'typeorm';
import { ProcessingStep } from '@meetio/shared';
import type { PipelineStepHandler, StepContext } from '../pipeline/pipeline-step-handler.js';
import { chunkSegments, DEFAULT_CHUNKER_OPTIONS, rechunkWithinRanges, type ChunkRange, type ChunkSegment, type ChunkerOptions } from './chunker.js';

/**
 * Pipeline step `chunk` (phase-12 step 2): transcript → meeting_chunks.
 *
 * - `full` run: cut the transcript from scratch.
 * - `changed` run (after edits): keep every existing chunk's seq range and
 *   rebuild only the text inside it (`rechunkWithinRanges`), so an edit touches
 *   exactly the chunks containing it (US-24) instead of shifting every later
 *   boundary.
 * Either way the result is reconciled, not replaced: chunks whose hash already
 * exists keep their id, embedding and the graph mentions/relations citing them;
 * stale ones are deleted (their citations cascade); new ones are inserted
 * un-embedded. A retry is therefore a no-op.
 */
export class ChunkStepHandler implements PipelineStepHandler {
  readonly step = ProcessingStep.CHUNK;

  constructor(
    private readonly dataSource: DataSource,
    private readonly options: ChunkerOptions = DEFAULT_CHUNKER_OPTIONS,
  ) {}

  async run(ctx: StepContext): Promise<void> {
    const segments = (await this.dataSource.query(
      `SELECT seq, text, started_at_ms, ended_at_ms, gap_before_ms FROM transcript_segments WHERE meeting_id = $1 ORDER BY seq`,
      [ctx.meetingId],
    )) as ChunkSegment[];
    const ranges =
      ctx.scope === 'changed'
        ? ((await this.dataSource.query(
            'SELECT segment_start_seq AS "segmentStartSeq", segment_end_seq AS "segmentEndSeq" FROM meeting_chunks WHERE meeting_id = $1',
            [ctx.meetingId],
          )) as ChunkRange[])
        : [];
    const drafts = ranges.length > 0 ? rechunkWithinRanges(segments, ranges, this.options) : chunkSegments(segments, this.options);
    if (ctx.signal.aborted) return;

    await this.dataSource.transaction(async (m) => {
      const hashes = drafts.map((d) => d.contentHash);
      await m.query('DELETE FROM meeting_chunks WHERE meeting_id = $1 AND NOT (content_hash = ANY($2::text[]))', [ctx.meetingId, hashes]);
      for (const d of drafts) {
        await m.query(
          `INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, content_hash)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (meeting_id, content_hash) DO NOTHING`,
          [ctx.meetingId, ctx.userId, d.content, d.segmentStartSeq, d.segmentEndSeq, d.contentHash],
        );
      }
    });
  }
}
