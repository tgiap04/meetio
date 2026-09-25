import type { ProcessingStep } from '@meetio/shared';

export interface StepContext {
  meetingId: string;
  userId: string;
  run: number;
  /**
   * `full`: process the whole meeting. `changed`: only what segments edited
   * after `changedSince` touch (US-24) — the summary step still sees everything.
   */
  scope: 'full' | 'changed';
  changedSince: Date | null;
  /** Aborted when the step exceeds its time budget; long calls should pass it on. */
  signal: AbortSignal;
}

/** One pipeline step's actual work. Phases 12–14 provide these; Phase 11 only runs them. */
export interface PipelineStepHandler {
  readonly step: ProcessingStep;
  run(context: StepContext): Promise<void>;
}

/**
 * A step error whose message was written for people (it ends up in
 * `GET /meetings/:id/status`). Anything else is replaced by a generic line —
 * a driver's or library's message can carry SQL, hosts or prompt fragments.
 */
export class ExplainedStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExplainedStepError';
  }
}

/** A failure retrying cannot fix (e.g. the user's monthly AI budget is spent) — fail the step now. */
export class NonRetryableStepError extends ExplainedStepError {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableStepError';
  }
}

/**
 * Which steps have an implementation. A step without one is where the
 * pipeline pauses — the meeting stays `processing` and is never reported
 * `ready` with nothing in it (clarifications 2026-09-25). Registering a handler
 * later and running the resume sweep picks those meetings up.
 */
export class PipelineStepRegistry {
  private readonly handlers = new Map<ProcessingStep, PipelineStepHandler>();

  register(handler: PipelineStepHandler): void {
    if (this.handlers.has(handler.step)) {
      throw new Error(`A handler for step "${handler.step}" is already registered`);
    }
    this.handlers.set(handler.step, handler);
  }

  get(step: ProcessingStep): PipelineStepHandler | undefined {
    return this.handlers.get(step);
  }
}
