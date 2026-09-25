import { jest } from '@jest/globals';
import { GeminiClient, type GenAiModels } from './gemini.client.js';
import { AiServiceUnavailableError, QuotaExceededError } from './ai-errors.js';
import type { UsageEntry, UsageTracker } from './usage-tracker.js';

const OPTIONS = { model: 'gemini-test', maxConcurrency: 2, retries: 2, retryBaseMs: 1 };
const request = { userId: 'u1', meetingId: 'm1', operation: 'summarize', prompt: 'p' };
const ok = { text: 'kết quả', usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 } };

function setup(generate: GenAiModels['generateContent']) {
  const recorded: UsageEntry[] = [];
  const usage = {
    assertWithinBudget: jest.fn(async () => undefined),
    record: jest.fn(async (e: UsageEntry) => void recorded.push(e)),
  };
  const client = new GeminiClient({ generateContent: generate }, usage as unknown as UsageTracker, OPTIONS);
  return { client, usage, recorded };
}

describe('GeminiClient', () => {
  it('records one usage row with the reported tokens for every successful call', async () => {
    const t = setup(async () => ok);
    await expect(t.client.generateText(request)).resolves.toEqual({ text: 'kết quả', inputTokens: 120, outputTokens: 30 });
    expect(t.recorded).toEqual([{ userId: 'u1', meetingId: 'm1', operation: 'summarize', model: 'gemini-test', inputTokens: 120, outputTokens: 30 }]);
  });

  it('checks the budget before calling and never calls when it is spent', async () => {
    const generate = jest.fn(async () => ok);
    const t = setup(generate);
    t.usage.assertWithinBudget.mockRejectedValue(new QuotaExceededError(100, 100));
    await expect(t.client.generateText(request)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(generate).not.toHaveBeenCalled();
  });

  it('retries rate limits and server errors, then succeeds', async () => {
    let calls = 0;
    const t = setup(async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error('busy'), { status: calls === 1 ? 429 : 503 });
      return ok;
    });
    await expect(t.client.generateText(request)).resolves.toMatchObject({ text: 'kết quả' });
    expect(calls).toBe(3);
    expect(t.recorded).toHaveLength(1);
  });

  it('gives up after its retries with AiServiceUnavailableError and records nothing', async () => {
    const t = setup(async () => {
      throw Object.assign(new Error('down'), { status: 500 });
    });
    await expect(t.client.generateText(request)).rejects.toBeInstanceOf(AiServiceUnavailableError);
    expect(t.recorded).toEqual([]);
  });

  it('does not retry a client error such as a bad request', async () => {
    const generate = jest.fn(async () => {
      throw Object.assign(new Error('bad'), { status: 400 });
    });
    const t = setup(generate);
    await expect(t.client.generateText(request)).rejects.toThrow('bad');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('never runs more calls at once than maxConcurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    const t = setup(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return ok;
    });
    await Promise.all(Array.from({ length: 6 }, () => t.client.generateText(request)));
    expect(peak).toBe(2);
  });

  it('a caller whose step timed out leaves the queue instead of calling Gemini later', async () => {
    const releases: (() => void)[] = [];
    const calls: string[] = [];
    const t = setup(async (params) => {
      calls.push(params.contents);
      if (calls.length <= 2) await new Promise<void>((r) => releases.push(r));
      return ok;
    });
    const busy = [t.client.generateText({ ...request, prompt: 'a' }), t.client.generateText({ ...request, prompt: 'b' })];
    await new Promise((r) => setTimeout(r, 0)); // both slots taken
    const controller = new AbortController();
    const queued = t.client.generateText({ ...request, prompt: 'late', signal: controller.signal });
    await new Promise((r) => setTimeout(r, 0)); // 'late' is waiting for a slot
    controller.abort();
    await expect(queued).rejects.toBeInstanceOf(AiServiceUnavailableError);
    releases.forEach((r) => r());
    await Promise.all(busy);
    expect(calls).toEqual(['a', 'b']);
  });

  it('refuses at once when the signal was already aborted', async () => {
    const generate = jest.fn(async () => ok);
    const t = setup(generate);
    const controller = new AbortController();
    controller.abort();
    await expect(t.client.generateText({ ...request, signal: controller.signal })).rejects.toBeInstanceOf(AiServiceUnavailableError);
    expect(generate).not.toHaveBeenCalled();
  });

  it('fails clearly when no API key is configured', async () => {
    const client = new GeminiClient(null, {} as UsageTracker, OPTIONS);
    expect(client.isConfigured()).toBe(false);
    await expect(client.generateText(request)).rejects.toBeInstanceOf(AiServiceUnavailableError);
  });
});
