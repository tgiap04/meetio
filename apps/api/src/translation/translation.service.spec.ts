import { jest } from '@jest/globals';
import { AiServiceUnavailableError, QuotaExceededError } from '../ai/ai-errors.js';
import { M, target, fakeStore, answer, seqsIn, echoModel, setup, settle } from './__tests__/translation-test-kit.js';

describe('TranslationService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('translates a window of segments in ONE call, stores each and emits per seq with usage attribution', async () => {
    const t = setup();
    [1, 2, 3].forEach((s) => t.service.enqueue(M, [s]));
    await settle();
    expect(t.calls).toEqual([[1, 2, 3]]);
    expect(t.requests[0]).toMatchObject({ userId: 'u1', meetingId: M, operation: 'translate' });
    expect(t.store.rows.get(2)).toMatchObject({ translatedText: 'en2', translatedTo: 'en-US' });
    expect(t.notifier.segmentTranslated.mock.calls).toEqual([
      [M, { seq: 1, translated_text: 'en1', translated_to: 'en-US' }],
      [M, { seq: 2, translated_text: 'en2', translated_to: 'en-US' }],
      [M, { seq: 3, translated_text: 'en3', translated_to: 'en-US' }],
    ]);
    expect(t.notifier.segmentTranslationFailed).not.toHaveBeenCalled();
  });

  it('flushes at 5 segments without waiting for the window', async () => {
    const t = setup();
    [1, 2, 3, 4, 5, 6].forEach((s) => t.service.enqueue(M, [s]));
    await jest.advanceTimersByTimeAsync(50);
    expect(t.calls).toEqual([[1, 2, 3, 4, 5]]);
    await settle();
    expect(t.calls).toEqual([[1, 2, 3, 4, 5], [6]]);
  });

  it('maps by seq even when the model answers out of order', async () => {
    const t = setup((r) => answer(seqsIn(r).reverse().map((s) => [s, `en${s}`])));
    t.service.enqueue(M, [1, 2]);
    await settle();
    expect(t.store.rows.get(1)?.translatedText).toBe('en1');
    expect(t.store.rows.get(2)?.translatedText).toBe('en2');
  });

  it('does nothing when translation is off or the meeting is gone', async () => {
    for (const meeting of [{ ...target, translateTo: null }, null]) {
      const t = setup(echoModel, fakeStore(meeting));
      t.service.enqueue(M, [1]);
      await settle();
      expect(t.generateText).not.toHaveBeenCalled();
    }
  });

  it('is idempotent: an already-translated seq is not sent again', async () => {
    const t = setup();
    t.service.enqueue(M, [1, 2]);
    await settle();
    t.service.enqueue(M, [1, 2]);
    await settle();
    expect(t.calls).toEqual([[1, 2]]);
    expect(t.notifier.segmentTranslated).toHaveBeenCalledTimes(2);
  });

  it('retries only the seqs a batch answer left out, one call each', async () => {
    const t = setup((r) => {
      const asked = seqsIn(r);
      return asked.length > 1 ? answer([[asked[0], `en${asked[0]}`]]) : echoModel(r);
    });
    t.service.enqueue(M, [1, 2, 3]);
    await settle();
    expect(t.calls).toEqual([[1, 2, 3], [2], [3]]);
    expect([1, 2, 3].map((s) => t.store.rows.get(s)?.translatedText)).toEqual(['en1', 'en2', 'en3']);
    expect(t.notifier.segmentTranslationFailed).not.toHaveBeenCalled();
  });

  it('isolates a bad answer: neighbours are translated, only the segment the model garbles is marked failed', async () => {
    const t = setup((r) => {
      const asked = seqsIn(r);
      // The batch answer is unparsable, and segment 2 stays unparsable on its own.
      if (asked.length > 1 || asked[0] === 2) return { text: 'not json', inputTokens: 1, outputTokens: 1 };
      return echoModel(r);
    });
    t.service.enqueue(M, [1, 2, 3]);
    await settle();
    expect(t.calls).toEqual([[1, 2, 3], [1], [2], [3]]);
    expect(t.store.rows.get(1)?.translatedText).toBe('en1');
    expect(t.store.rows.get(2)?.translatedText).toBeNull();
    expect(t.store.rows.get(3)?.translatedText).toBe('en3');
    expect(t.notifier.segmentTranslationFailed.mock.calls).toEqual([[M, { seq: 2 }]]);
  });

  it('a provider/transport error on the batch fails every segment at once — no per-segment fan-out', async () => {
    const t = setup(() => {
      throw new AiServiceUnavailableError('down');
    });
    t.service.enqueue(M, [1, 2, 3]);
    await settle();
    expect(t.calls).toEqual([[1, 2, 3]]);
    expect(t.notifier.segmentTranslationFailed.mock.calls.map((c) => c[1])).toEqual([{ seq: 1 }, { seq: 2 }, { seq: 3 }]);
  });

  it('a provider error while retrying singles stops the fan-out and fails the rest', async () => {
    const t = setup((r) => {
      const asked = seqsIn(r);
      if (asked.length > 1) return answer([[1, 'en1']]);
      throw new Error('provider 500');
    });
    t.service.enqueue(M, [1, 2, 3, 4]);
    await settle();
    expect(t.calls).toEqual([[1, 2, 3, 4], [2]]);
    expect(t.store.rows.get(1)?.translatedText).toBe('en1');
    expect(t.notifier.segmentTranslationFailed.mock.calls.map((c) => c[1])).toEqual([{ seq: 2 }, { seq: 3 }, { seq: 4 }]);
  });

  it('treats an unparsable answer like a failure and does not store garbage', async () => {
    const t = setup(() => ({ text: 'not json', inputTokens: 0, outputTokens: 0 }));
    t.service.enqueue(M, [1]);
    await settle();
    expect(t.store.rows.get(1)?.translatedText).toBeNull();
    expect(t.notifier.segmentTranslationFailed).toHaveBeenCalledWith(M, { seq: 1 });
  });

  it('stops at once when the AI budget is spent: no per-segment retries, every segment marked failed, no crash', async () => {
    const t = setup(() => {
      throw new QuotaExceededError(10, 10);
    });
    t.service.enqueue(M, [1, 2]);
    await settle();
    expect(t.calls).toEqual([[1, 2]]);
    expect(t.notifier.segmentTranslationFailed).toHaveBeenCalledTimes(2);
    // The meeting keeps working: a later segment is attempted afresh (and the budget check decides again).
    t.service.enqueue(M, [3]);
    await settle();
    expect(t.calls).toEqual([[1, 2], [3]]);
  });

  it('keeps translating later windows after a failed one', async () => {
    let first = true;
    const t = setup((r) => {
      if (first) {
        first = false;
        throw new QuotaExceededError(1, 1);
      }
      return echoModel(r);
    });
    t.service.enqueue(M, [1, 2]);
    await settle();
    t.service.enqueue(M, [3]);
    await settle();
    expect(t.store.rows.get(3)?.translatedText).toBe('en3');
  });

  it('never throws from enqueue, even when the store is down', async () => {
    const t = setup();
    t.store.targetFor.mockRejectedValue(new Error('db down'));
    expect(() => t.service.enqueue(M, [1])).not.toThrow();
    await settle();
    expect(t.generateText).not.toHaveBeenCalled();
  });

  it('does not emit when the row was translated meanwhile (saveTranslation lost the race)', async () => {
    const t = setup();
    t.store.saveTranslation.mockResolvedValue(false);
    t.service.enqueue(M, [1]);
    await settle();
    expect(t.notifier.segmentTranslated).not.toHaveBeenCalled();
    expect(t.notifier.segmentTranslationFailed).not.toHaveBeenCalled();
  });

  it('never puts segment text in a log line', async () => {
    const t = setup(() => {
      throw new Error('echoed vi1 secret');
    });
    const { Logger } = await import('@nestjs/common');
    const logged: string[] = [];
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' ')));
    }
    t.service.enqueue(M, [1]);
    await settle();
    jest.restoreAllMocks();
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join('\n')).not.toMatch(/vi1|secret/);
  });
});
