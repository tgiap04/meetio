import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { retrySegmentTranslation } from '../api/segment-translation';
import { useRetrySegmentTranslation } from './use-retry-segment-translation';

jest.mock('../api/segment-translation', () => ({ retrySegmentTranslation: jest.fn() }));
const mockRetry = retrySegmentTranslation as jest.Mock;

let hook: ReturnType<typeof useRetrySegmentTranslation>;
let queryClient: QueryClient;
const mounted: TestRenderer.ReactTestRenderer[] = [];
const onTranslated = jest.fn();

function Harness() {
  hook = useRetrySegmentTranslation('m1', onTranslated);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  jest.spyOn(queryClient, 'invalidateQueries');
  act(() => {
    mounted.push(
      TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      ),
    );
  });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
  queryClient.clear();
});

describe('useRetrySegmentTranslation', () => {
  it('retries one seq: flags it retrying meanwhile, then reports the translation and refreshes the transcript', async () => {
    let release!: (v: unknown) => void;
    mockRetry.mockReturnValue(new Promise((r) => (release = r)));
    let pending!: Promise<void>;
    act(() => {
      pending = hook.retry(4);
    });
    expect(hook.retrying.has(4)).toBe(true);
    expect(hook.retrying.has(5)).toBe(false);
    await act(async () => {
      release({ seq: 4, translated_text: 'hello', translated_to: 'en-US' });
      await pending;
    });
    expect(mockRetry).toHaveBeenCalledWith('m1', 4);
    expect(hook.retrying.size).toBe(0);
    expect(onTranslated).toHaveBeenCalledWith({ seq: 4, translated_text: 'hello', translated_to: 'en-US' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['segments', 'm1'] });
  });

  it('keeps the failure per seq as a message, clears it on the next try, and never calls onTranslated', async () => {
    mockRetry.mockRejectedValueOnce(new Error('boom'));
    await act(async () => hook.retry(4));
    expect(hook.errors[4]).toEqual(expect.any(String));
    expect(hook.retrying.size).toBe(0);
    expect(onTranslated).not.toHaveBeenCalled();

    mockRetry.mockResolvedValueOnce({ seq: 4, translated_text: 'ok', translated_to: 'en-US' });
    await act(async () => hook.retry(4));
    expect(hook.errors[4]).toBeUndefined();
  });

  it('ignores a second tap while that seq is still retrying', async () => {
    mockRetry.mockReturnValue(new Promise(() => undefined));
    act(() => void hook.retry(4));
    act(() => void hook.retry(4));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});
