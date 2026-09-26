import type { UsageTracker } from './usage-tracker.js';
import { AiServiceUnavailableError } from './ai-errors.js';
import type { GeminiCallRunner } from './gemini-call-runner.js';

/** The slice of `@google/genai`'s `ai.models` this client uses — injectable so tests need no network. */
export interface GenAiModels {
  generateContent(params: {
    model: string;
    contents: string;
    config?: { systemInstruction?: string; responseMimeType?: string; responseSchema?: Record<string, unknown>; abortSignal?: AbortSignal };
  }): Promise<{ text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }>;
  embedContent(params: {
    model: string;
    contents: string[];
    config?: { outputDimensionality?: number; taskType?: string; abortSignal?: AbortSignal };
  }): Promise<{ embeddings?: { values?: number[] }[] }>;
  countTokens(params: { model: string; contents: string; config?: { abortSignal?: AbortSignal } }): Promise<{ totalTokens?: number }>;
}

interface Attribution {
  userId: string;
  meetingId: string | null;
  /** Free-form label stored in usage_records, e.g. "summarize", "embed", "search". */
  operation: string;
  signal?: AbortSignal;
}

export interface GenerateRequest extends Attribution {
  prompt: string;
  systemInstruction?: string;
  json?: boolean;
  /** Gemini structured output: the response must match this OpenAPI-style schema. Implies `json`. */
  responseSchema?: Record<string, unknown>;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';

export interface EmbedRequest extends Attribution {
  texts: string[];
  taskType: EmbedTaskType;
}

export interface EmbedResult {
  /** One L2-normalised 768-d vector per input text, same order. */
  vectors: number[][];
  /** Real token count per input text, from countTokens. */
  tokenCounts: number[];
}

export interface GeminiClientOptions {
  textModel: string;
  embeddingModel: string;
  dimensions: number;
}

const normalise = (v: number[]) => {
  const norm = Math.hypot(...v);
  return norm > 0 ? v.map((x) => x / norm) : v;
};

/**
 * Shared Gemini access for the pipeline and search. Every call: budget check →
 * key-pool runner (rotation, 429 rest, retries, concurrency) → a usage_records
 * row with real token counts. Prompts, texts and responses are never logged (NFR-04).
 */
export class GeminiClient {
  constructor(
    private readonly runner: GeminiCallRunner<GenAiModels> | null,
    private readonly usage: UsageTracker,
    private readonly options: GeminiClientOptions,
  ) {}

  isConfigured(): boolean {
    return this.runner !== null;
  }

  async generateText(request: GenerateRequest): Promise<GenerateResult> {
    const runner = this.requireRunner();
    await this.usage.assertWithinBudget(request.userId);
    const response = await runner.run(request.signal, (models) =>
      models.generateContent({
        model: this.options.textModel,
        contents: request.prompt,
        config: {
          systemInstruction: request.systemInstruction,
          responseMimeType: request.json || request.responseSchema ? 'application/json' : undefined,
          responseSchema: request.responseSchema,
          abortSignal: request.signal,
        },
      }),
    );
    const result = {
      text: response.text ?? '',
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
    await this.record(request, this.options.textModel, result.inputTokens, result.outputTokens);
    return result;
  }

  /**
   * Embeds a batch. Gemini's embed API reports no token usage, so each text is
   * counted with countTokens first (free) — the real number goes to usage_records
   * and to the chunk's token_count (clarifications 2026-09-26).
   */
  async embed(request: EmbedRequest): Promise<EmbedResult> {
    const runner = this.requireRunner();
    if (request.texts.length === 0) return { vectors: [], tokenCounts: [] };
    await this.usage.assertWithinBudget(request.userId);
    const model = this.options.embeddingModel;

    const [tokenCounts, response] = await Promise.all([
      Promise.all(
        request.texts.map(async (text) => {
          const counted = await runner.run(request.signal, (m) => m.countTokens({ model, contents: text, config: { abortSignal: request.signal } }));
          if (typeof counted.totalTokens !== 'number') throw new AiServiceUnavailableError('countTokens không trả về số token');
          return counted.totalTokens;
        }),
      ),
      runner.run(request.signal, (m) =>
        m.embedContent({
          model,
          contents: request.texts,
          config: { outputDimensionality: this.options.dimensions, taskType: request.taskType, abortSignal: request.signal },
        }),
      ),
    ]);

    // The embed call succeeded, so it is billed whether or not its output is usable: account first.
    await this.record(request, model, tokenCounts.reduce((a, b) => a + b, 0), 0);
    const vectors = (response.embeddings ?? []).map((e) => e.values ?? []);
    if (vectors.length !== request.texts.length || vectors.some((v) => v.length !== this.options.dimensions)) {
      throw new AiServiceUnavailableError(`Gemini trả về ${vectors.length} vector cho ${request.texts.length} đoạn, sai kích thước`);
    }
    // A truncated (768 of 3072) Gemini embedding is not unit-length; cosine search expects it to be.
    return { vectors: vectors.map(normalise), tokenCounts };
  }

  private requireRunner(): GeminiCallRunner<GenAiModels> {
    if (!this.runner) throw new AiServiceUnavailableError('Chưa cấu hình GEMINI_API_KEY');
    return this.runner;
  }

  private record(a: Attribution, model: string, inputTokens: number, outputTokens: number): Promise<void> {
    return this.usage.record({ userId: a.userId, meetingId: a.meetingId, operation: a.operation, model, inputTokens, outputTokens });
  }
}
