import { ProcessingStep } from '@meetio/shared';
import { currentProcessingStep, PROCESSING_STEP_LABELS } from './processing-step-labels';

function step(step: ProcessingStep, status: string) {
  return { step, status };
}

describe('currentProcessingStep', () => {
  it('returns the first step when nothing has been reported yet', () => {
    expect(currentProcessingStep([])).toBe(ProcessingStep.CHUNK);
  });

  it('returns the first non-succeeded step, in pipeline order', () => {
    const steps = [
      step(ProcessingStep.CHUNK, 'succeeded'),
      step(ProcessingStep.EMBED, 'running'),
    ];
    expect(currentProcessingStep(steps)).toBe(ProcessingStep.EMBED);
  });

  it('returns a failed step rather than treating it as done', () => {
    const steps = [
      step(ProcessingStep.CHUNK, 'succeeded'),
      step(ProcessingStep.EMBED, 'succeeded'),
      step(ProcessingStep.EXTRACT, 'failed'),
    ];
    expect(currentProcessingStep(steps)).toBe(ProcessingStep.EXTRACT);
  });

  it('returns null once every step has succeeded', () => {
    const steps = [
      step(ProcessingStep.CHUNK, 'succeeded'),
      step(ProcessingStep.EMBED, 'succeeded'),
      step(ProcessingStep.EXTRACT, 'succeeded'),
      step(ProcessingStep.RESOLVE, 'succeeded'),
      step(ProcessingStep.SUMMARIZE, 'succeeded'),
    ];
    expect(currentProcessingStep(steps)).toBeNull();
  });

  it('has a Vietnamese label for every step', () => {
    Object.values(ProcessingStep).forEach((value) => {
      expect(PROCESSING_STEP_LABELS[value]).toEqual(expect.any(String));
    });
  });
});
