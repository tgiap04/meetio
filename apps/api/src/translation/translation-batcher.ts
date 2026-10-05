export interface BatchItem {
  seq: number;
  text: string;
}

export interface BatcherOptions {
  /** How long the first buffered item may wait for company. */
  windowMs: number;
  /** A full batch flushes at once, without waiting for the window. */
  maxBatch: number;
  onFlush: (items: BatchItem[]) => Promise<void>;
  /** A handler that throws must not stop later batches; it is reported here. */
  onError?: (error: unknown) => void;
  /** Called after a batch finished when nothing else is buffered or running — the owner may drop this batcher. */
  onIdle?: () => void;
}

/**
 * Collects segments for one meeting and releases them as a batch: after `windowMs`
 * from the first item, or as soon as `maxBatch` are waiting — whichever is first
 * (phase-09 "Kiến trúc"). A seq added twice within a window is kept once.
 */
export class TranslationBatcher {
  private items = new Map<number, BatchItem>();
  private timer: NodeJS.Timeout | null = null;
  private inflight = 0;
  private readonly settled: Promise<void>[] = [];

  constructor(private readonly options: BatcherOptions) {}

  add(item: BatchItem): void {
    if (!this.items.has(item.seq)) this.items.set(item.seq, item);
    if (this.items.size >= this.options.maxBatch) {
      this.release();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.release(), this.options.windowMs);
    }
  }

  isIdle(): boolean {
    return this.items.size === 0 && this.inflight === 0;
  }

  /** Releases whatever is buffered now and resolves once every batch handed out so far has finished. */
  async drain(): Promise<void> {
    this.release();
    await Promise.all(this.settled);
  }

  /** Drops buffered items and the timer; batches already running finish on their own. */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.items.clear();
  }

  private release(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.items.size === 0) return;
    const batch = [...this.items.values()];
    this.items = new Map();
    this.inflight += 1;
    const run = this.options
      .onFlush(batch)
      .catch((error: unknown) => this.options.onError?.(error))
      .finally(() => {
        this.inflight -= 1;
        this.settled.splice(this.settled.indexOf(run), 1);
        if (this.isIdle()) this.options.onIdle?.();
      });
    this.settled.push(run);
  }
}
