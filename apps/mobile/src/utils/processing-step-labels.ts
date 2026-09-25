import { ProcessingStep } from '@meetio/shared';

/** Vietnamese label for each pipeline step (US-28) — shown while a meeting is
 *  `queued`/`processing` so the user knows what stage it's at. */
export const PROCESSING_STEP_LABELS: Record<ProcessingStep, string> = {
  [ProcessingStep.CHUNK]: 'Đang chia đoạn âm thanh',
  [ProcessingStep.EMBED]: 'Đang tạo embedding',
  [ProcessingStep.EXTRACT]: 'Đang trích xuất nội dung',
  [ProcessingStep.RESOLVE]: 'Đang đối chiếu thông tin',
  [ProcessingStep.SUMMARIZE]: 'Đang tóm tắt nội dung',
};

/** Order the pipeline actually runs in — used to pick the "current" step out
 *  of `processing_steps` when several rows exist. */
const STEP_ORDER: ProcessingStep[] = [
  ProcessingStep.CHUNK,
  ProcessingStep.EMBED,
  ProcessingStep.EXTRACT,
  ProcessingStep.RESOLVE,
  ProcessingStep.SUMMARIZE,
];

interface StepStatusLike {
  step: ProcessingStep;
  status: string;
}

/**
 * The step to show the user right now: the first one in pipeline order that
 * hasn't succeeded yet (running, pending, or failed). `null` when every step
 * the server reported has already succeeded, or when it reported none yet
 * (a `queued` meeting whose jobs haven't been created).
 */
export function currentProcessingStep(steps: readonly StepStatusLike[]): ProcessingStep | null {
  const byStep = new Map(steps.map((entry) => [entry.step, entry]));
  for (const step of STEP_ORDER) {
    const entry = byStep.get(step);
    if (!entry || entry.status !== 'succeeded') {
      return step;
    }
  }
  return null;
}
