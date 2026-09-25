import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SegmentUpsertRepository } from './segment-upsert.repository.js';
import type { SegmentInput } from './segment-input.js';

interface PendingWrite {
  segment: SegmentInput;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface MeetingQueue {
  items: PendingWrite[];
  timer: NodeJS.Timeout | null;
  /** The batch currently being written — `flush` must wait for it too. */
  inflight: Promise<void>;
}

const DEFAULT_WINDOW_MS = 200;
const MAX_BATCH = 500;

/**
 * Collects segments per meeting for a short window (default 200ms) and writes
 * them in one statement (phase-05 "Kiến trúc"). Each `write()` resolves only
 * after its batch is committed — the caller acks per seq on that promise, so
 * batching saves round trips without ever acking data that is not yet durable.
 *
 * Batches for one meeting are written strictly one after another, so a `flush`
 * that returns means every segment handed in before it is in PostgreSQL.
 */
@Injectable()
export class SegmentBatchWriter implements OnModuleDestroy {
  private readonly queues = new Map<string, MeetingQueue>();
  private readonly windowMs: number;

  constructor(
    private readonly repository: SegmentUpsertRepository,
    config: ConfigService,
  ) {
    const configured = Number(config.get<string>('SEGMENT_BATCH_WINDOW_MS'));
    this.windowMs = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_WINDOW_MS;
  }

  write(meetingId: string, segment: SegmentInput): Promise<void> {
    const queue = this.queueFor(meetingId);
    const done = new Promise<void>((resolve, reject) => queue.items.push({ segment, resolve, reject }));
    if (queue.items.length >= MAX_BATCH) {
      void this.flush(meetingId);
    } else if (!queue.timer) {
      queue.timer = setTimeout(() => void this.flush(meetingId), this.windowMs);
    }
    return done;
  }

  /** Writes whatever is buffered for `meetingId` and waits for every earlier batch. Never rejects. */
  async flush(meetingId: string): Promise<void> {
    const queue = this.queues.get(meetingId);
    if (!queue) {
      return;
    }
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = null;
    }
    const batch = queue.items.splice(0);
    if (batch.length > 0) {
      queue.inflight = queue.inflight.then(() => this.writeBatch(meetingId, batch));
    }
    const settled = queue.inflight;
    await settled;
    if (this.queues.get(meetingId) === queue && queue.items.length === 0 && queue.inflight === settled) {
      this.queues.delete(meetingId);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.keys()].map((id) => this.flush(id)));
  }

  private queueFor(meetingId: string): MeetingQueue {
    let queue = this.queues.get(meetingId);
    if (!queue) {
      queue = { items: [], timer: null, inflight: Promise.resolve() };
      this.queues.set(meetingId, queue);
    }
    return queue;
  }

  private async writeBatch(meetingId: string, batch: PendingWrite[]): Promise<void> {
    // The same seq twice in one window (a fast client retry) collapses to the
    // first copy, matching what ON CONFLICT DO NOTHING would keep anyway.
    const firstBySeq = new Map<number, SegmentInput>();
    for (const { segment } of batch) {
      if (!firstBySeq.has(segment.seq)) {
        firstBySeq.set(segment.seq, segment);
      }
    }
    try {
      await this.repository.upsertMany(meetingId, [...firstBySeq.values()]);
      batch.forEach((w) => w.resolve());
    } catch (error) {
      batch.forEach((w) => w.reject(error));
    }
  }
}
