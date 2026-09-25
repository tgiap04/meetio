import { ExplainedStepError, NonRetryableStepError } from '../pipeline/pipeline-step-handler.js';

/** The user's monthly AI token budget is spent (NFR-07). Retrying cannot help, so the pipeline fails the step at once. */
export class QuotaExceededError extends NonRetryableStepError {
  constructor(used: number, budget: number) {
    super(`Đã dùng ${used}/${budget} token AI trong tháng`);
    this.name = 'QuotaExceededError';
  }
}

/** Gemini is not configured, or kept failing after the client's own retries. Retryable at the step level. */
export class AiServiceUnavailableError extends ExplainedStepError {
  constructor(message: string) {
    super(message);
    this.name = 'AiServiceUnavailableError';
  }
}
