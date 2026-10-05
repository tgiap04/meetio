import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useRetrySegmentTranslation, TRANSLATE_FAILED_MESSAGE } from './use-retry-segment-translation';

let hook: ReturnType<typeof useRetrySegmentTranslation>;
const run = jest.fn();
const mounted: TestRenderer.ReactTestRenderer[] = [];

function Harness() {
  hook = useRetrySegmentTranslation(run);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    mounted.push(TestRenderer.create(<Harness />));
  });
});
afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));

describe('useRetrySegmentTranslation', () => {
  it('runs one seq: flags it retrying meanwhile and clears the flag when done', async () => {
    let release!: () => void;
    run.mockReturnValue(new Promise<void>((r) => (release = r)));
    let pending!: Promise<void>;
    act(() => {
      pending = hook.retry(4);
    });
    expect(hook.retrying.has(4)).toBe(true);
    expect(hook.retrying.has(5)).toBe(false);
    await act(async () => {
      release();
      await pending;
    });
    expect(run).toHaveBeenCalledWith(4);
    expect(hook.retrying.size).toBe(0);
  });

  it('keeps the failure per seq as a message, and clears it on the next try', async () => {
    run.mockRejectedValueOnce(new Error('Model not downloaded'));
    await act(async () => hook.retry(4));
    expect(hook.errors[4]).toBe(TRANSLATE_FAILED_MESSAGE);
    expect(hook.retrying.size).toBe(0);

    run.mockResolvedValueOnce(undefined);
    await act(async () => hook.retry(4));
    expect(hook.errors[4]).toBeUndefined();
  });

  it('ignores a second tap while that seq is still running', () => {
    run.mockReturnValue(new Promise(() => undefined));
    act(() => void hook.retry(4));
    act(() => void hook.retry(4));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
