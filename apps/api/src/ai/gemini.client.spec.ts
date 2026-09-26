import { jest } from '@jest/globals';
import { GeminiClient, type GenAiModels } from './gemini.client.js';
import { GeminiCallRunner } from './gemini-call-runner.js';
import { GeminiKeyPool } from './gemini-key-pool.js';
import { AiServiceUnavailableError, QuotaExceededError } from './ai-errors.js';
import type { UsageEntry, UsageTracker } from './usage-tracker.js';

const OPTIONS = { textModel: 'gemini-text', embeddingModel: 'gemini-embed', dimensions: 3 };
const who = { userId: 'u1', meetingId: 'm1' };

function setup(models: Partial<GenAiModels>) {
  const recorded: UsageEntry[] = [];
  const usage = {
    assertWithinBudget: jest.fn(async () => undefined),
    record: jest.fn(async (e: UsageEntry) => void recorded.push(e)),
  };
  const runner = new GeminiCallRunner(new GeminiKeyPool([models as GenAiModels], { defaultCooldownMs: 1000 }), {
    maxConcurrency: 4,
    retries: 1,
    retryBaseMs: 1,
    log: () => undefined,
  });
  return { client: new GeminiClient(runner, usage as unknown as UsageTracker, OPTIONS), usage, recorded };
}

describe('GeminiClient', () => {
  it('generateText records one usage row with the reported tokens', async () => {
    const t = setup({ generateContent: async () => ({ text: 'kết quả', usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 } }) });
    await expect(t.client.generateText({ ...who, operation: 'summarize', prompt: 'p' })).resolves.toEqual({ text: 'kết quả', inputTokens: 120, outputTokens: 30 });
    expect(t.recorded).toEqual([{ ...who, operation: 'summarize', model: 'gemini-text', inputTokens: 120, outputTokens: 30 }]);
  });

  it('embed counts each text with countTokens, records the real total, and returns unit vectors', async () => {
    const t = setup({
      countTokens: async ({ contents }) => ({ totalTokens: contents.length }),
      embedContent: async ({ contents, config }) => {
        expect(config).toMatchObject({ outputDimensionality: 3, taskType: 'RETRIEVAL_DOCUMENT' });
        return { embeddings: contents.map(() => ({ values: [3, 0, 4] })) };
      },
    });
    const out = await t.client.embed({ ...who, operation: 'embed', texts: ['abcd', 'ab'], taskType: 'RETRIEVAL_DOCUMENT' });
    expect(out.tokenCounts).toEqual([4, 2]);
    expect(out.vectors).toEqual([[0.6, 0, 0.8], [0.6, 0, 0.8]]);
    expect(t.recorded).toEqual([{ ...who, operation: 'embed', model: 'gemini-embed', inputTokens: 6, outputTokens: 0 }]);
  });

  it('refuses a wrong-sized embedding response instead of storing garbage, but still accounts the call', async () => {
    const t = setup({ countTokens: async () => ({ totalTokens: 1 }), embedContent: async () => ({ embeddings: [{ values: [1, 2] }] }) });
    await expect(t.client.embed({ ...who, operation: 'embed', texts: ['a'], taskType: 'RETRIEVAL_QUERY' })).rejects.toBeInstanceOf(AiServiceUnavailableError);
    // the call was made (and billed), so its real token count is still accounted
    expect(t.recorded).toEqual([{ ...who, operation: 'embed', model: 'gemini-embed', inputTokens: 1, outputTokens: 0 }]);
  });

  it('never records a made-up count when countTokens gives none', async () => {
    const t = setup({ countTokens: async () => ({}), embedContent: async () => ({ embeddings: [{ values: [1, 0, 0] }] }) });
    await expect(t.client.embed({ ...who, operation: 'embed', texts: ['a'], taskType: 'RETRIEVAL_QUERY' })).rejects.toThrow(/countTokens/);
    expect(t.recorded).toEqual([]);
  });

  it('checks the budget before any call', async () => {
    const generateContent = jest.fn(async () => ({ text: 'x' }));
    const t = setup({ generateContent });
    t.usage.assertWithinBudget.mockRejectedValue(new QuotaExceededError(10, 10));
    await expect(t.client.generateText({ ...who, operation: 'x', prompt: 'p' })).rejects.toBeInstanceOf(QuotaExceededError);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('fails clearly without any configured key', async () => {
    const client = new GeminiClient(null, {} as UsageTracker, OPTIONS);
    expect(client.isConfigured()).toBe(false);
    await expect(client.embed({ ...who, operation: 'e', texts: ['a'], taskType: 'RETRIEVAL_QUERY' })).rejects.toBeInstanceOf(AiServiceUnavailableError);
  });
});
