import type { UsageTracker } from './usage-tracker.js';
import { AiServiceUnavailableError } from './ai-errors.js';

/** The slice of `@google/genai`'s `ai.models` this client uses — injectable so tests need no network. */
export interface GenAiModels {
  generateContent(params: {
    model: string;
    contents: string;
    config?: { systemInstruction?: string; responseMimeType?: string; abortSignal?: AbortSignal };
  }): Promise<{ text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }>;
}

export interface GenerateRequest {
  userId: string;
  meetingId: string | null;
  /** Free-form label stored in usage_records, e.g. "summarize", "extract". */
  operation: string;
  prompt: string;
  systemInstruction?: string;
  json?: boolean;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface GeminiClientOptions {
  model: string;
  maxConcurrency: number;
  retries: number;
  retryBaseMs: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;

/**
 * Shared Gemini access for the pipeline (phase-11). Every call: budget check →
 * bounded concurrency → retries on rate-limit / server errors → a usage_records
 * row with the tokens Gemini reported. Prompts and responses are never logged (NFR-04).
 *
 * Embeddings are deliberately absent: the Gemini API returns no token counts
 * for them, and Phase 12 — their first caller — decides how to account them.
 */
export class GeminiClient {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly models: GenAiModels | null,
    private readonly usage: UsageTracker,
    private readonly options: GeminiClientOptions,
  ) {}

  isConfigured(): boolean {
    return this.models !== null;
  }

  async generateText(request: GenerateRequest): Promise<GenerateResult> {
    if (!this.models) throw new AiServiceUnavailableError('Chưa cấu hình GEMINI_API_KEY');
    await this.usage.assertWithinBudget(request.userId);
    const response = await this.withSlot(request.signal, () => this.withRetries(request, this.models!));
    const result = {
      text: response.text ?? '',
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
    await this.usage.record({
      userId: request.userId,
      meetingId: request.meetingId,
      operation: request.operation,
      model: this.options.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    return result;
  }

  private async withRetries(request: GenerateRequest, models: GenAiModels) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await models.generateContent({
          model: this.options.model,
          contents: request.prompt,
          config: {
            systemInstruction: request.systemInstruction,
            responseMimeType: request.json ? 'application/json' : undefined,
            abortSignal: request.signal,
          },
        });
      } catch (error) {
        const status = statusOf(error);
        const retryable = status === undefined || RETRYABLE_STATUS.has(status);
        if (!retryable || attempt >= this.options.retries || request.signal?.aborted) {
          throw retryable ? new AiServiceUnavailableError(`Gemini lỗi sau ${attempt + 1} lần gọi (HTTP ${status ?? 'mạng'})`) : error;
        }
        await new Promise((r) => setTimeout(r, this.options.retryBaseMs * 4 ** attempt));
      }
    }
  }

  /**
   * Bounded concurrency. A caller whose step has timed out (signal aborted)
   * leaves the queue instead of starting a call nobody is waiting for; a call
   * already in flight is cancelled by the SDK through the same signal.
   */
  private async withSlot<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
    // An already-aborted signal never fires 'abort' again — check before queueing, or the caller hangs.
    if (signal?.aborted) {
      throw new AiServiceUnavailableError('Đã hủy trước khi gọi Gemini');
    }
    if (this.active >= this.options.maxConcurrency) {
      await new Promise<void>((resolve, reject) => {
        const waiter = () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        const onAbort = () => {
          this.waiting.splice(this.waiting.indexOf(waiter), 1);
          reject(new AiServiceUnavailableError('Đã hủy trong lúc chờ lượt gọi Gemini'));
        };
        this.waiting.push(waiter);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
    if (signal?.aborted) {
      this.waiting.shift()?.();
      throw new AiServiceUnavailableError('Đã hủy trước khi gọi Gemini');
    }
    this.active++;
    try {
      return await work();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}
