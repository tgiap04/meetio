import { randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { ProcessingStatusPayload, ProcessingStep } from '@meetio/shared';
import { AppDataSource, registerPgVectorTypes } from '../../database/data-source.js';
import { PipelineEngine } from '../pipeline-engine.js';
import { PipelineStepRegistry, type PipelineStepHandler, type StepContext } from '../pipeline-step-handler.js';
import { PipelineStore } from '../pipeline-store.js';
import { retryDelayMs, STEP_ATTEMPTS, STEP_ORDER, stepJobId, stepQueueName, type StepJobData } from '../pipeline-steps.js';

/**
 * The real engine + store + BullMQ, against the Postgres and Redis from `make up`,
 * with no Nest (jest-runtime cannot load the Nest module graph — see
 * test-support/e2e-app.ts). A per-harness Redis prefix keeps these queues away
 * from any API server that happens to be running.
 */
export class PipelineHarness {
  readonly registry = new PipelineStepRegistry();
  readonly events: ProcessingStatusPayload[] = [];
  readonly ready: string[] = [];
  private readonly prefix = `pipeline-test-${randomUUID()}`;
  private readonly connections: Redis[] = [];
  private readonly queues = new Map<ProcessingStep, Queue<StepJobData>>();
  private readonly workers: Worker[] = [];
  readonly store = new PipelineStore(AppDataSource);
  readonly engine: PipelineEngine;
  private readonly userIds: string[] = [];

  constructor(stepTimeoutMs = 5_000, retryBaseMs = 10) {
    for (const step of STEP_ORDER) {
      this.queues.set(step, new Queue(stepQueueName(step), { connection: this.redis(), prefix: this.prefix }));
    }
    this.engine = new PipelineEngine(
      this.store,
      this.registry,
      {
        enqueue: async (data) => {
          await this.queues.get(data.step)!.add(data.step, data, {
            jobId: stepJobId(data.meeting_id, data.run, data.step),
            attempts: STEP_ATTEMPTS,
            backoff: { type: 'custom' },
            removeOnComplete: true,
            removeOnFail: true,
          });
        },
      },
      {
        processingStatus: (p) => void this.events.push(p),
        meetingReady: async (id) => void this.ready.push(id),
      },
      { stepTimeoutMs, logger: { log: () => undefined, warn: () => undefined } },
    );
    for (const step of STEP_ORDER) {
      this.workers.push(
        new Worker(
          stepQueueName(step),
          (job: Job<StepJobData>) => this.engine.handleStepJob(job.data, job.attemptsMade, job.opts.attempts ?? STEP_ATTEMPTS),
          { connection: this.redis(), prefix: this.prefix, settings: { backoffStrategy: (n: number) => retryDelayMs(n, retryBaseMs) } },
        ),
      );
    }
  }

  static async init(): Promise<void> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      await registerPgVectorTypes(AppDataSource);
    }
  }

  /** A `queued` meeting on run 1, as `end` leaves it. */
  async queuedMeeting(): Promise<{ meetingId: string; userId: string }> {
    const userId = randomUUID();
    this.userIds.push(userId);
    await AppDataSource.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'P', 'x')`, [userId, `p-${userId}@meetio.test`]);
    const [{ id }] = (await AppDataSource.query(
      `INSERT INTO meetings (user_id, title, status, source_language, started_at, ended_at, pipeline_run)
       VALUES ($1, 'Pipeline', 'queued', 'vi-VN', now(), now(), 1) RETURNING id`,
      [userId],
    )) as { id: string }[];
    await AppDataSource.query(`INSERT INTO transcript_segments (meeting_id, seq, text, started_at_ms, ended_at_ms) VALUES ($1, 1, 'giữ nguyên', 0, 1)`, [id]);
    return { meetingId: id, userId };
  }

  handle(step: ProcessingStep, run: (ctx: StepContext) => Promise<void> = async () => undefined): PipelineStepHandler {
    const handler = { step, run };
    this.registry.register(handler);
    return handler;
  }

  meeting(id: string) {
    return AppDataSource.query('SELECT status, failure_reason, pipeline_run FROM meetings WHERE id = $1', [id]).then((r) => r[0]);
  }

  steps(id: string): Promise<Record<string, { status: string; attempts: number; error_message: string | null }>> {
    return AppDataSource.query('SELECT step, status, attempts, error_message FROM processing_jobs WHERE meeting_id = $1', [id]).then(
      (rows: { step: string; status: string; attempts: number; error_message: string | null }[]) =>
        Object.fromEntries(rows.map(({ step, ...rest }) => [step, rest])),
    );
  }

  async waitFor<T>(read: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 10_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = await read();
      if (done(value)) return value;
      if (Date.now() > deadline) throw new Error(`Timed out; last value: ${JSON.stringify(value)}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  jobCount(step: ProcessingStep): Promise<number> {
    return this.queues.get(step)!.count();
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map(async (q) => { await q.obliterate({ force: true }); await q.close(); }));
    await Promise.all(this.connections.map((c) => c.quit()));
    if (this.userIds.length > 0) await AppDataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [this.userIds]);
  }

  private redis(): Redis {
    const c = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    this.connections.push(c);
    return c;
  }
}
