import { UnrecoverableError } from 'bullmq';
import type { ProcessingStatusPayload, ProcessingStep } from '@meetio/shared';
import { ExplainedStepError, NonRetryableStepError, type PipelineStepRegistry } from './pipeline-step-handler.js';
import type { PipelineStore, RunState } from './pipeline-store.js';
import { STEP_ORDER, type RunJobData, type StepJobData } from './pipeline-steps.js';

export interface StepQueuePort {
  enqueue(data: StepJobData): Promise<void>;
}

/** Where pipeline progress goes: the meeting's WebSocket room and the push channel. Must never throw. */
export interface PipelineEvents {
  processingStatus(payload: ProcessingStatusPayload): void;
  meetingReady(meetingId: string): Promise<void>;
}

export interface EngineLogger {
  log(message: string): void;
  warn(message: string): void;
}

export interface EngineOptions {
  stepTimeoutMs: number;
  logger: EngineLogger;
}

class StepTimeoutError extends Error {
  constructor(step: ProcessingStep, ms: number) {
    super(`Bước ${step} vượt quá ${Math.round(ms / 1000)} giây`);
    this.name = 'StepTimeoutError';
  }
}

const progressOf = (step: ProcessingStep) => STEP_ORDER.indexOf(step) / STEP_ORDER.length;

const isSafeToShow = (error: unknown) => error instanceof ExplainedStepError || error instanceof StepTimeoutError;

/**
 * What goes into processing_jobs.error_message — which `GET /status` returns to
 * the owner (US-29). An arbitrary exception can carry SQL, hostnames or prompt
 * fragments, so only deliberately written messages are kept verbatim.
 */
function investigationMessage(step: ProcessingStep, error: unknown): string {
  if (isSafeToShow(error)) return (error as Error).message;
  return `Lỗi hệ thống ở bước ${step}${error instanceof Error ? ` (${error.name})` : ''}`;
}

/**
 * Runs a meeting through the pipeline one step job at a time (phase-11).
 * Plain TypeScript — no Nest — so it runs unchanged in the API's BullMQ
 * workers and in integration tests against real Postgres and Redis.
 */
export class PipelineEngine {
  constructor(
    private readonly store: PipelineStore,
    private readonly registry: PipelineStepRegistry,
    private readonly steps: StepQueuePort,
    private readonly events: PipelineEvents,
    private readonly options: EngineOptions,
  ) {}

  /** The `meeting-processing` job: start (or resume) the run and schedule its next step. */
  async handleRunJob(data: RunJobData): Promise<void> {
    const state = await this.store.startRun(data.meeting_id, data.run);
    if (!state) return;
    await this.advance(state);
  }

  /**
   * Schedules the next unfinished step, completes the run when none is left,
   * or stops at a step nobody has implemented yet — the meeting then stays
   * `processing` rather than being reported `ready` with nothing in it.
   * Idempotent: step job ids are per run and step, so a second call is a no-op.
   */
  async advance(state: RunState): Promise<void> {
    const next = await this.store.nextStep(state.meetingId);
    if (next === null) {
      if (await this.store.completeRun(state)) {
        this.events.processingStatus({ meeting_id: state.meetingId, status: 'ready', progress: 1 });
        await this.events.meetingReady(state.meetingId);
      }
      return;
    }
    this.events.processingStatus({ meeting_id: state.meetingId, status: 'processing', step: next, progress: progressOf(next) });
    if (!this.registry.get(next)) {
      this.options.logger.log(`Meeting ${state.meetingId} waits at step "${next}": no handler registered yet`);
      return;
    }
    await this.steps.enqueue({ meeting_id: state.meetingId, run: state.run, step: next });
  }

  /**
   * One attempt of one step. Throws to let BullMQ retry; on the last attempt
   * (or a non-retryable error) the step and the meeting are marked failed first.
   */
  async handleStepJob(data: StepJobData, attemptsMade: number, maxAttempts: number): Promise<void> {
    const state = await this.store.current(data.meeting_id, data.run);
    const handler = this.registry.get(data.step);
    if (!state || !handler) return;
    if (!(await this.store.markRunning(state, data.step))) return;
    this.events.processingStatus({ meeting_id: state.meetingId, status: 'processing', step: data.step, progress: progressOf(data.step) });

    try {
      await this.withTimeout(data.step, (signal) =>
        handler.run({ meetingId: state.meetingId, userId: state.userId, run: state.run, scope: state.scope, changedSince: state.changedSince, signal }),
      );
    } catch (error) {
      const message = investigationMessage(data.step, error);
      if (!isSafeToShow(error)) {
        // Full detail stays in the server log (stack only, never step content — NFR-04).
        this.options.logger.warn(`Step "${data.step}" of ${state.meetingId} threw: ${error instanceof Error ? error.stack : String(error)}`);
      }
      const final = error instanceof NonRetryableStepError || attemptsMade + 1 >= maxAttempts;
      if (final) {
        if (await this.store.failStep(state, data.step, message)) {
          this.events.processingStatus({ meeting_id: state.meetingId, status: 'failed', step: data.step });
        }
        this.options.logger.warn(`Meeting ${state.meetingId} failed at step "${data.step}" after ${attemptsMade + 1} attempt(s)`);
      } else {
        await this.store.recordAttemptError(state, data.step, message);
      }
      throw error instanceof NonRetryableStepError ? new UnrecoverableError(message) : error;
    }

    if (await this.store.markSucceeded(state, data.step)) {
      await this.advance(state);
    }
  }

  /** Resume sweep: re-drives every stalled `processing` run. Safe to call repeatedly. */
  async resumeStalled(before: Date): Promise<number> {
    const stalled = await this.store.stalledRuns(before);
    for (const state of stalled) {
      await this.advance(state);
    }
    return stalled.length;
  }

  private async withTimeout(step: ProcessingStep, work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new StepTimeoutError(step, this.options.stepTimeoutMs));
      }, this.options.stepTimeoutMs);
    });
    try {
      await Promise.race([work(controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
