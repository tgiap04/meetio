import { jest } from '@jest/globals';
import { TranslationBatcher, type BatchItem } from './translation-batcher.js';

const item = (seq: number): BatchItem => ({ seq, text: `t${seq}` });

describe('TranslationBatcher', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const setup = (windowMs = 2000, maxBatch = 5) => {
    const flushed: number[][] = [];
    const batcher = new TranslationBatcher({
      windowMs,
      maxBatch,
      onFlush: async (items) => {
        flushed.push(items.map((i) => i.seq));
      },
    });
    return { batcher, flushed };
  };

  it('flushes once the window elapses, counted from the first item', async () => {
    const { batcher, flushed } = setup();
    batcher.add(item(1));
    await jest.advanceTimersByTimeAsync(1500);
    batcher.add(item(2));
    await jest.advanceTimersByTimeAsync(400);
    expect(flushed).toEqual([]);
    await jest.advanceTimersByTimeAsync(100);
    expect(flushed).toEqual([[1, 2]]);
  });

  it('flushes immediately when the batch is full, and starts a fresh window after', async () => {
    const { batcher, flushed } = setup();
    [1, 2, 3, 4, 5].forEach((s) => batcher.add(item(s)));
    await jest.advanceTimersByTimeAsync(0);
    expect(flushed).toEqual([[1, 2, 3, 4, 5]]);
    batcher.add(item(6));
    await jest.advanceTimersByTimeAsync(2000);
    expect(flushed).toEqual([[1, 2, 3, 4, 5], [6]]);
  });

  it('collapses a seq added twice in one window', async () => {
    const { batcher, flushed } = setup();
    batcher.add(item(1));
    batcher.add(item(1));
    batcher.add(item(2));
    await jest.advanceTimersByTimeAsync(2000);
    expect(flushed).toEqual([[1, 2]]);
  });

  it('reports idle only when nothing is buffered or in flight', async () => {
    const { batcher } = setup();
    expect(batcher.isIdle()).toBe(true);
    batcher.add(item(1));
    expect(batcher.isIdle()).toBe(false);
    await jest.advanceTimersByTimeAsync(2000);
    expect(batcher.isIdle()).toBe(true);
  });

  it('keeps going when a flush handler throws', async () => {
    const calls: number[][] = [];
    const errors: unknown[] = [];
    const batcher = new TranslationBatcher({
      windowMs: 100,
      maxBatch: 5,
      onFlush: async (items) => {
        calls.push(items.map((i) => i.seq));
        if (calls.length === 1) throw new Error('boom');
      },
      onError: (e) => errors.push(e),
    });
    batcher.add(item(1));
    await jest.advanceTimersByTimeAsync(100);
    batcher.add(item(2));
    await jest.advanceTimersByTimeAsync(100);
    expect(calls).toEqual([[1], [2]]);
    expect(errors).toHaveLength(1);
  });

  it('drain() flushes what is buffered right away and waits for it', async () => {
    const { batcher, flushed } = setup();
    batcher.add(item(1));
    await batcher.drain();
    expect(flushed).toEqual([[1]]);
  });

  it('calls onIdle after the last batch, not between overlapping ones', async () => {
    const idle = jest.fn();
    const batcher = new TranslationBatcher({ windowMs: 100, maxBatch: 1, onFlush: async () => undefined, onIdle: idle });
    batcher.add(item(1));
    batcher.add(item(2));
    await jest.advanceTimersByTimeAsync(0);
    expect(idle).toHaveBeenCalledTimes(1);
  });
});
