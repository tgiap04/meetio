import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ProcessingStep } from '@meetio/shared';
import type { PipelineStepHandler, StepContext } from '../pipeline/pipeline-step-handler.js';
import type { GeminiClient } from '../ai/gemini.client.js';
import { EXTRACTION_RESPONSE_SCHEMA, ExtractionSchemaError, parseExtraction } from './extraction-schema.js';
import { EXTRACTION_SYSTEM_INSTRUCTION, extractionPrompt } from './extraction-prompt.js';

/** Chunks per Gemini call (clarifications 2026-09-26, NFR-08). */
export const EXTRACT_GROUP = 4;
/** One call + 2 retries on an answer that fails the schema (phase-13 step 2). */
export const EXTRACT_ATTEMPTS = 3;

/**
 * Pipeline step `extract`: chunks → entities and relations per chunk, stored on the chunk
 * (`meeting_chunks.extraction`) for the resolve step. Works through chunks with no
 * `extracted_at` in groups of four, one commit per group, so a retry resumes after the last
 * finished group and a `changed` run only pays for the chunks the chunk step re-created.
 *
 * An answer that keeps failing the schema costs only its group: those chunks are marked done
 * with no extraction and the meeting carries on. Gemini/network errors propagate so the
 * pipeline retries the step.
 */
export class ExtractStepHandler implements PipelineStepHandler {
  readonly step = ProcessingStep.EXTRACT;
  private readonly logger = new Logger('ExtractStep');

  constructor(
    private readonly dataSource: DataSource,
    private readonly gemini: GeminiClient,
  ) {}

  async run(ctx: StepContext): Promise<void> {
    for (;;) {
      if (ctx.signal.aborted) return;
      const group = (await this.dataSource.query(
        `SELECT id, content FROM meeting_chunks WHERE meeting_id = $1 AND extracted_at IS NULL
         ORDER BY segment_start_seq, id LIMIT $2`,
        [ctx.meetingId, EXTRACT_GROUP],
      )) as { id: string; content: string }[];
      if (group.length === 0) return;

      const labelled = group.map((c, i) => ({ ...c, label: `C${i + 1}` }));
      const perLabel = await this.extract(ctx, labelled);
      await this.dataSource.transaction(async (m) => {
        for (const c of labelled) {
          const extraction = perLabel?.get(c.label);
          await m.query('UPDATE meeting_chunks SET extraction = $2, extracted_at = now() WHERE id = $1', [
            c.id,
            extraction ? JSON.stringify(extraction) : null,
          ]);
        }
      });
    }
  }

  private async extract(ctx: StepContext, chunks: { id: string; content: string; label: string }[]) {
    const labels = chunks.map((c) => c.label);
    for (let attempt = 1; attempt <= EXTRACT_ATTEMPTS; attempt++) {
      const { text } = await this.gemini.generateText({
        userId: ctx.userId,
        meetingId: ctx.meetingId,
        operation: 'extract',
        systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION,
        prompt: extractionPrompt(chunks),
        responseSchema: EXTRACTION_RESPONSE_SCHEMA,
        signal: ctx.signal,
      });
      try {
        return parseExtraction(text, labels);
      } catch (error) {
        if (!(error instanceof ExtractionSchemaError)) throw error;
        // Never the transcript or the model's text — only ids and the reason (NFR-04).
        this.logger.warn(`meeting ${ctx.meetingId}: invalid extraction (attempt ${attempt}/${EXTRACT_ATTEMPTS}): ${error.message}`);
      }
    }
    this.logger.warn(`meeting ${ctx.meetingId}: skipped chunks ${chunks.map((c) => c.id).join(',')} after ${EXTRACT_ATTEMPTS} invalid answers`);
    return null;
  }
}
