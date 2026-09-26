import { AiServiceUnavailableError } from './ai-errors.js';
import type { GeminiKeyPool, KeySlot } from './gemini-key-pool.js';

export interface RunnerOptions {
  maxConcurrency: number;
  /** Retries for server / network errors (429 moves to the next key without counting). */
  retries: number;
  retryBaseMs: number;
  log: (message: string) => void;
}

const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;
const RETRYABLE = new Set([500, 502, 503, 504]);
// Only Google's actual bad-key answer (HTTP 400, reason API_KEY_INVALID) drops a key.
// A 403 carries status PERMISSION_DENIED for almost any cause — API not enabled, billing
// off, IAM or key-restriction denial — none of which a restart-less "drop the key" fixes,
// and on a single-key setup that would be a silent, permanent outage.
const isInvalidKey = (error: unknown) =>
  statusOf(error) === 400 && /API_KEY_INVALID|API key not valid/i.test(String((error as Error)?.message));

/**
 * Runs one Gemini call across the key pool: bounded concurrency, the next key
 * in turn for each attempt, 429 → that key rests and the call moves straight on
 * to another key, an invalid key is dropped, 5xx / network errors back off and
 * retry. Aborting the signal leaves the queue or cancels the in-flight call.
 */
export class GeminiCallRunner<T> {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly pool: GeminiKeyPool<T>,
    private readonly options: RunnerOptions,
  ) {}

  async run<R>(signal: AbortSignal | undefined, call: (client: T) => Promise<R>): Promise<R> {
    await this.takeSlot(signal);
    try {
      return await this.attempt(signal, call);
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  private async attempt<R>(signal: AbortSignal | undefined, call: (client: T) => Promise<R>): Promise<R> {
    let serverFailures = 0;
    for (;;) {
      if (signal?.aborted) throw new AiServiceUnavailableError('Đã hủy lời gọi Gemini');
      const slot = this.pool.acquire();
      if (!slot) {
        const wait = this.pool.soonestAvailableInMs();
        throw new AiServiceUnavailableError(
          wait === null ? 'Mọi khóa Gemini đều không hợp lệ' : `Mọi khóa Gemini đang tạm nghỉ, thử lại sau ${Math.ceil(wait / 1000)} giây`,
        );
      }
      try {
        return await call(slot.client);
      } catch (error) {
        if (!this.handle(slot, error)) throw error;
        if (RETRYABLE.has(statusOf(error) ?? 0) || statusOf(error) === undefined) {
          if (++serverFailures > this.options.retries) {
            throw new AiServiceUnavailableError(`Gemini lỗi sau ${serverFailures} lần gọi (HTTP ${statusOf(error) ?? 'mạng'})`);
          }
          // 503 "high demand" spikes last seconds, not milliseconds: double each wait, with jitter so
          // concurrent calls do not return to an overloaded model in lockstep.
          await new Promise((r) => setTimeout(r, this.options.retryBaseMs * 2 ** (serverFailures - 1) * (0.75 + Math.random() * 0.5)));
        }
      }
    }
  }

  /** Records what an error means for the key; returns false when the error should reach the caller. */
  private handle(slot: KeySlot<T>, error: unknown): boolean {
    const status = statusOf(error);
    if (status === 429) {
      const ms = this.pool.rest(slot, error);
      this.options.log(`Gemini key #${slot.index} rate-limited; resting ${Math.round(ms / 1000)}s`);
      return true;
    }
    if (isInvalidKey(error)) {
      this.pool.disable(slot);
      this.options.log(`Gemini key #${slot.index} rejected as invalid; dropped until restart`);
      return true;
    }
    if (status === 403) {
      this.options.log(`Gemini key #${slot.index} got HTTP 403 (API access, billing or key restriction) — key kept`);
      throw new AiServiceUnavailableError('Gemini từ chối truy cập (HTTP 403) — kiểm tra API, billing hoặc giới hạn của khóa trong project');
    }
    return status === undefined || RETRYABLE.has(status);
  }

  private async takeSlot(signal: AbortSignal | undefined): Promise<void> {
    // An already-aborted signal never fires 'abort' again — check before queueing, or the caller hangs.
    if (signal?.aborted) throw new AiServiceUnavailableError('Đã hủy trước khi gọi Gemini');
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
    this.active++;
  }
}
