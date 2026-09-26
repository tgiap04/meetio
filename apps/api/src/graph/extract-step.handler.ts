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
/** Groups in flight at once; the Gemini runner's own concurrency cap still applies. */
export const EXTRACT_PARALLEL = 4;

/**
 * Pipeline step `extract`: chunks → entities and relations per chunk, stored on the chunk
 * (`meeting_chunks.extraction`) for the resolve step. Works through chunks with no
 * `extracted_at` in groups of four, several groups at a time, one commit per group, so a retry
 * resumes after the finished groups and a `changed` run only pays for the re-created chunks.
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
    const pending = (await this.dataSource.query(
      `SELECT id, content FROM meeting_chunks WHERE meeting_id = $1 AND extracted_at IS NULL ORDER BY segment_start_seq, id`,
      [ctx.meetingId],
    )) as { id: string; content: string }[];
    const groups: { id: string; content: string; label: string }[][] = [];
    for (let i = 0; i < pending.length; i += EXTRACT_GROUP) {
      groups.push(pending.slice(i, i + EXTRACT_GROUP).map((c, j) => ({ ...c, label: `C${j + 1}` })));
    }
    // Groups are independent; a few in flight keeps a 60-minute meeting under the 2-minute budget
    // (one at a time took ~7 minutes in the live check). Each commits on its own, so a failure
    // still leaves the finished groups done for the retry.
    let next = 0;
    const worker = async () => {
      while (next < groups.length && !ctx.signal.aborted) await this.processGroup(ctx, groups[next++]);
    };
    await Promise.all(Array.from({ length: Math.min(EXTRACT_PARALLEL, groups.length) }, worker));
  }

  private async processGroup(ctx: StepContext, labelled: { id: string; content: string; label: string }[]): Promise<void> {
    const perLabel = await this.extract(ctx, labelled);
    if (ctx.signal.aborted) return;
    await this.dataSource.transaction(async (m) => {
      for (const c of labelled) {
        const extraction = perLabel?.get(c.label);
        await m.query('UPDATE meeting_chunks SET extraction = $2, extracted_at = now() WHERE id = $1 AND extracted_at IS NULL', [
          c.id,
          extraction ? JSON.stringify(extraction) : null,
        ]);
      }
    });
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
