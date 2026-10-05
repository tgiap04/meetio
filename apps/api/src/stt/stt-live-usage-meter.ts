import { Logger } from '@nestjs/common';
import { QuotaExceededError } from '../ai/ai-errors.js';
import type { UsageTracker } from '../ai/usage-tracker.js';

/** Gemini bills audio input at 32 tokens per second; usage rows carry that so the monthly budget stays meaningful. */
const AUDIO_TOKENS_PER_SECOND = 32;

export interface UsageContext {
  userId: string;
  meetingId: string | null;
  model: string;
}

/**
 * Records a stream's Live time as `stt-live` usage, one row per elapsed interval (a minute in
 * production) and a last one for the remainder at the end, and re-checks the monthly budget on
 * every tick so a stream cannot run past a spent budget. Failures are logged by type only.
 */
export class LiveUsageMeter {
  private readonly logger = new Logger(LiveUsageMeter.name);
  private timer: NodeJS.Timeout | null = null;
  private billedUntil = 0;

  constructor(
    private readonly usage: Pick<UsageTracker, 'record' | 'assertWithinBudget'>,
    private readonly context: UsageContext,
    private readonly intervalMs: number,
    private readonly onBudgetExceeded: () => void,
    /** Extra per-tick check (e.g. consent still valid); it handles its own outcome. */
    private readonly onTick?: () => Promise<void>,
  ) {}

  start(): void {
    this.billedUntil = Date.now();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  /** Stops the timer and bills the time since the last row. */
  async stop(): Promise<void> {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    await this.bill();
  }

  private async tick(): Promise<void> {
    await this.bill();
    try {
      await this.usage.assertWithinBudget(this.context.userId);
    } catch (error) {
      if (error instanceof QuotaExceededError) this.onBudgetExceeded();
      else this.logger.warn(`Live budget check failed (${errorName(error)})`);
    }
    await this.onTick?.();
  }

  private async bill(): Promise<void> {
    const now = Date.now();
    const seconds = (now - this.billedUntil) / 1000;
    if (seconds < 1) return;
    this.billedUntil = now;
    try {
      await this.usage.record({ ...this.context, operation: 'stt-live', inputTokens: Math.round(seconds * AUDIO_TOKENS_PER_SECOND), outputTokens: 0 });
    } catch (error) {
      this.logger.warn(`Live usage could not be recorded (${errorName(error)})`);
    }
  }
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'Error');
