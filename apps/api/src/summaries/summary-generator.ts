import { Logger } from '@nestjs/common';
import type { GeminiClient } from '../ai/gemini.client.js';
import { estimateTokens } from '../chunking/chunker.js';
import { mergeSystemInstruction, summaryPrompt, summarySystemInstruction } from './summary-prompt.js';
import { parseSummary, SUMMARY_RESPONSE_SCHEMA, SummarySchemaError, type ExtractedAction, type ParsedSummary } from './summary-schema.js';

export interface SummaryChunk {
  id: string;
  content: string;
}

export interface SummaryInput {
  userId: string;
  meetingId: string;
  sourceLanguage: string;
  /** YYYY-MM-DD — resolves relative deadlines. */
  meetingDate: string;
  chunks: SummaryChunk[];
  signal: AbortSignal;
}

/** Summary lines and tasks with their citations as real chunk ids. */
export interface GeneratedSummary {
  insufficient: boolean;
  points: { text: string; chunkIds: string[] }[];
  decisions: { text: string; chunkIds: string[] }[];
  actions: (Omit<ExtractedAction, 'label'> & { chunkId: string })[];
}

/** One call + 2 retries on an answer that fails the schema. */
export const SUMMARY_ATTEMPTS = 3;

/**
 * Produces the summary in one call when the transcript fits `singlePassTokens`, otherwise in two
 * tiers (phase-14 step 2): each slice of chunks is summarized on its own, then the partial points
 * are merged in a final call. Citations survive both tiers as chunk ids; tasks come from the slices.
 */
export class SummaryGenerator {
  private readonly logger = new Logger('SummarizeStep');

  constructor(
    private readonly gemini: GeminiClient,
    private readonly singlePassTokens: number,
  ) {}

  async generate(input: SummaryInput): Promise<GeneratedSummary> {
    const slices = this.slice(input.chunks);
    if (slices.length === 1) return this.summarizeSlice(input, slices[0]);

    const partials = await Promise.all(slices.map((s) => this.summarizeSlice(input, s)));
    const lines = partials.flatMap((p) => [...p.points, ...p.decisions.map((d) => ({ ...d, decision: true }))]);
    if (lines.length === 0) return { insufficient: partials.every((p) => p.insufficient), points: [], decisions: [], actions: [] };
    const parts = lines.map((l, i) => ({ label: `P${i + 1}`, content: l.text, chunkIds: l.chunkIds }));
    const merged = await this.call(input, mergeSystemInstruction(input.sourceLanguage, input.meetingDate), parts);
    const ids = (labels: string[]) => [...new Set(labels.flatMap((l) => parts.find((p) => p.label === l)?.chunkIds ?? []))];
    return {
      insufficient: merged.insufficient && merged.points.length === 0,
      points: merged.points.map((p) => ({ text: p.text, chunkIds: ids(p.labels) })),
      decisions: merged.decisions.map((d) => ({ text: d.text, chunkIds: ids(d.labels) })),
      actions: partials.flatMap((p) => p.actions),
    };
  }

  private slice(chunks: SummaryChunk[]): SummaryChunk[][] {
    const slices: SummaryChunk[][] = [[]];
    let tokens = 0;
    for (const c of chunks) {
      const t = estimateTokens(c.content);
      if (tokens + t > this.singlePassTokens && slices[slices.length - 1].length > 0) {
        slices.push([]);
        tokens = 0;
      }
      slices[slices.length - 1].push(c);
      tokens += t;
    }
    return slices;
  }

  private async summarizeSlice(input: SummaryInput, chunks: SummaryChunk[]): Promise<GeneratedSummary> {
    const parts = chunks.map((c, i) => ({ label: `C${i + 1}`, content: c.content, id: c.id }));
    const parsed = await this.call(input, summarySystemInstruction(input.sourceLanguage, input.meetingDate), parts);
    const id = (label: string) => parts.find((p) => p.label === label)!.id;
    return {
      insufficient: parsed.insufficient,
      points: parsed.points.map((p) => ({ text: p.text, chunkIds: p.labels.map(id) })),
      decisions: parsed.decisions.map((d) => ({ text: d.text, chunkIds: d.labels.map(id) })),
      actions: parsed.actions.map(({ label, ...a }) => ({ ...a, chunkId: id(label) })),
    };
  }

  private async call(input: SummaryInput, systemInstruction: string, parts: { label: string; content: string }[]): Promise<ParsedSummary> {
    const labels = parts.map((p) => p.label);
    for (let attempt = 1; attempt <= SUMMARY_ATTEMPTS; attempt++) {
      const { text } = await this.gemini.generateText({
        userId: input.userId,
        meetingId: input.meetingId,
        operation: 'summarize',
        systemInstruction,
        prompt: summaryPrompt(parts),
        responseSchema: SUMMARY_RESPONSE_SCHEMA,
        signal: input.signal,
      });
      try {
        return parseSummary(text, labels);
      } catch (error) {
        if (!(error instanceof SummarySchemaError)) throw error;
        // Ids and the reason only — never the transcript or the model's text (NFR-04).
        this.logger.warn(`meeting ${input.meetingId}: invalid summary (attempt ${attempt}/${SUMMARY_ATTEMPTS})`);
      }
    }
    throw new SummarySchemaError(`Gemini không trả tóm tắt đúng định dạng sau ${SUMMARY_ATTEMPTS} lần`);
  }
}
