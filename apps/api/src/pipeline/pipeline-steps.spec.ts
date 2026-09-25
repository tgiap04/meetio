import { retryDelayMs, STEP_ATTEMPTS, STEP_ORDER } from './pipeline-steps.js';
import { PipelineStepRegistry } from './pipeline-step-handler.js';

describe('pipeline constants', () => {
  it('retries 3 times after the first attempt, waiting 2s, 8s, 32s (US-29)', () => {
    expect(STEP_ATTEMPTS).toBe(4);
    expect([1, 2, 3].map((n) => retryDelayMs(n, 2000))).toEqual([2000, 8000, 32000]);
  });

  it('runs the five steps in architecture order', () => {
    expect(STEP_ORDER).toEqual(['chunk', 'embed', 'extract', 'resolve', 'summarize']);
  });

  it('refuses two handlers for the same step', () => {
    const registry = new PipelineStepRegistry();
    registry.register({ step: 'chunk', run: async () => undefined });
    expect(() => registry.register({ step: 'chunk', run: async () => undefined })).toThrow(/already registered/);
    expect(registry.get('embed')).toBeUndefined();
  });
});
